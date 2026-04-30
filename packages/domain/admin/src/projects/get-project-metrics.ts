import { type IssueId, type NotFoundError, OrganizationId, type ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type {
  ProjectIssueLifecyclePoint,
  ProjectMetrics,
  ProjectMetricsActivityPoint,
  ProjectTopIssue,
} from "./project-metrics.ts"
import {
  AdminProjectMetricsRepository,
  type ProjectAnnotationBucket,
  type ProjectMetricCountBucket,
} from "./project-metrics-repository.ts"
import { AdminProjectRepository, type ProjectIssueLifecycleEvent } from "./project-repository.ts"

const DAY_SECONDS = 24 * 60 * 60
const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 90
const TOP_ISSUES_LIMIT = 5

export interface GetProjectMetricsInput {
  readonly projectId: ProjectId
  readonly windowDays?: number
  /** Anchor for "now"; tests pin this for determinism, production callers omit. */
  readonly now?: Date
}

const clampWindow = (days: number | undefined): number => {
  const requested = days ?? DEFAULT_WINDOW_DAYS
  if (requested < 1) return 1
  if (requested > MAX_WINDOW_DAYS) return MAX_WINDOW_DAYS
  return requested
}

const startOfUtcDay = (msEpoch: number): Date => new Date(Math.floor(msEpoch / 1000 / DAY_SECONDS) * DAY_SECONDS * 1000)

/**
 * Build the full sparse-to-dense day sequence for the window.
 * `windowEnd` falls in the last bucket; the first bucket starts
 * `windowDays - 1` whole days earlier.
 */
const buildDayBuckets = (windowEnd: Date, windowDays: number): readonly Date[] => {
  const lastBucket = startOfUtcDay(windowEnd.getTime())
  const buckets: Date[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    buckets.push(new Date(lastBucket.getTime() - i * DAY_SECONDS * 1000))
  }
  return buckets
}

const denseCountSeries = (
  sparse: readonly ProjectMetricCountBucket[],
  buckets: readonly Date[],
): ReadonlyMap<string, number> => {
  const byKey = new Map<string, number>()
  for (const point of sparse) {
    byKey.set(startOfUtcDay(point.bucketStart.getTime()).toISOString(), point.count)
  }
  const out = new Map<string, number>()
  for (const bucket of buckets) {
    const key = bucket.toISOString()
    out.set(key, byKey.get(key) ?? 0)
  }
  return out
}

const denseAnnotationSeries = (
  sparse: readonly ProjectAnnotationBucket[],
  buckets: readonly Date[],
): ReadonlyMap<string, { passed: number; failed: number }> => {
  const byKey = new Map<string, { passed: number; failed: number }>()
  for (const point of sparse) {
    const key = startOfUtcDay(point.bucketStart.getTime()).toISOString()
    byKey.set(key, { passed: point.passedCount, failed: point.failedCount })
  }
  const out = new Map<string, { passed: number; failed: number }>()
  for (const bucket of buckets) {
    const key = bucket.toISOString()
    out.set(key, byKey.get(key) ?? { passed: 0, failed: 0 })
  }
  return out
}

/**
 * Compose the per-day issue lifecycle composition by walking events
 * forward from the start of the window. Returns three counts (untracked /
 * tracked / resolved) per bucket, including a flat baseline of issues
 * that had no events in the window (their state is constant).
 *
 * Algorithm:
 *
 *  1. For each issue with events in the window, compute its "state
 *     today" from its timestamps and a per-day state for every bucket.
 *  2. Subtract today's per-state contribution of those issues from the
 *     snapshot to derive the baseline (issues without events in the
 *     window — their state is constant and equals their state today).
 *  3. result[D] = baseline + state[D] for each day.
 *
 * Why subtract event-issues from the snapshot rather than rewinding?
 * Both produce the same `result[today]` (matches snapshot by
 * construction), but the forward walk is easier to reason about and
 * avoids subtle bugs around issues created mid-window — they shouldn't
 * contribute on days before their `createdAt`.
 */
export const composeIssueLifecycleTimeline = (input: {
  readonly snapshot: { readonly untracked: number; readonly tracked: number; readonly resolved: number }
  readonly events: readonly ProjectIssueLifecycleEvent[]
  readonly buckets: readonly Date[]
}): ProjectIssueLifecyclePoint[] => {
  type State = "absent" | "untracked" | "tracked" | "resolved"
  const stateAt = (event: ProjectIssueLifecycleEvent, atDayStart: Date): State => {
    // "atDayStart" is midnight UTC of bucket D; we ask the question
    // "what is the issue's state at the *end* of day D?" — i.e. just
    // before midnight of D+1. Compare against the next-day midnight.
    const cutoff = new Date(atDayStart.getTime() + DAY_SECONDS * 1000)
    if (event.createdAt >= cutoff) return "absent"
    if ((event.resolvedAt && event.resolvedAt < cutoff) || (event.ignoredAt && event.ignoredAt < cutoff)) {
      return "resolved"
    }
    if (event.firstEvalAttachedAt && event.firstEvalAttachedAt < cutoff) return "tracked"
    return "untracked"
  }

  // Aggregate per-bucket contribution from event-issues.
  const perBucket = new Map<string, { untracked: number; tracked: number; resolved: number }>()
  for (const bucket of input.buckets) {
    perBucket.set(bucket.toISOString(), { untracked: 0, tracked: 0, resolved: 0 })
  }

  // Today's per-state contribution from event-issues (used to derive baseline).
  const todayCounts = { untracked: 0, tracked: 0, resolved: 0 }
  const todayBucket = input.buckets[input.buckets.length - 1]

  for (const event of input.events) {
    if (todayBucket) {
      const todayState = stateAt(event, todayBucket)
      if (todayState !== "absent") {
        todayCounts[todayState] += 1
      }
    }
    for (const bucket of input.buckets) {
      const state = stateAt(event, bucket)
      if (state === "absent") continue
      const cell = perBucket.get(bucket.toISOString())
      if (cell) cell[state] += 1
    }
  }

  // Baseline = snapshot − event-issues' contribution today. Clamp at 0
  // to absorb skew (e.g. an event-issue resolved before the window
  // opened still appears in the snapshot but shouldn't double-count).
  const baseline = {
    untracked: Math.max(0, input.snapshot.untracked - todayCounts.untracked),
    tracked: Math.max(0, input.snapshot.tracked - todayCounts.tracked),
    resolved: Math.max(0, input.snapshot.resolved - todayCounts.resolved),
  }

  return input.buckets.map((bucket) => {
    const cell = perBucket.get(bucket.toISOString()) ?? { untracked: 0, tracked: 0, resolved: 0 }
    return {
      bucketStart: bucket.toISOString(),
      untracked: baseline.untracked + cell.untracked,
      tracked: baseline.tracked + cell.tracked,
      resolved: baseline.resolved + cell.resolved,
    }
  })
}

/** Current state from the issue's lifecycle event row, used for top-issues labelling. */
const currentIssueState = (event: ProjectIssueLifecycleEvent): "untracked" | "tracked" | "resolved" => {
  if (event.resolvedAt || event.ignoredAt) return "resolved"
  if (event.firstEvalAttachedAt) return "tracked"
  return "untracked"
}

/**
 * Backoffice "project metrics over time" use-case.
 *
 * Fetches the project's organisation id (via `findById`, which also
 * fails fast on missing/soft-deleted projects), then fans out five
 * reads in parallel:
 *  - trace histogram (CH)
 *  - manual-annotation histogram (CH, scores where `source='annotation'`)
 *  - top-N issues by occurrences in window (CH; mirrors the user-facing Issues page signal)
 *  - issue lifecycle snapshot + events (PG)
 *
 * Composes the stacked-area timeline in pure code; densifies the activity
 * histograms so the chart has a value per day even when CH reports gaps.
 * Hydrates top-issue display names via a follow-up PG fetch keyed on the
 * CH-returned ids.
 */
export const getProjectMetricsUseCase = (
  input: GetProjectMetricsInput,
): Effect.Effect<
  ProjectMetrics,
  NotFoundError | RepositoryError,
  AdminProjectRepository | AdminProjectMetricsRepository
> =>
  Effect.gen(function* () {
    const windowDays = clampWindow(input.windowDays)
    const now = input.now ?? new Date()
    const since = new Date(now.getTime() - windowDays * DAY_SECONDS * 1000)
    const buckets = buildDayBuckets(now, windowDays)

    const projectRepo = yield* AdminProjectRepository
    const metricsRepo = yield* AdminProjectMetricsRepository

    yield* Effect.annotateCurrentSpan("admin.project.metrics.windowDays", windowDays)

    const project = yield* projectRepo.findById(input.projectId)
    const organizationId = OrganizationId(project.organization.id)

    const [traceBuckets, annotationBuckets, topOccurrences, snapshot, events] = yield* Effect.all(
      [
        metricsRepo.getTraceHistogram({
          organizationId,
          projectId: input.projectId,
          since,
          bucketSeconds: DAY_SECONDS,
        }),
        metricsRepo.getAnnotationHistogram({
          organizationId,
          projectId: input.projectId,
          since,
          bucketSeconds: DAY_SECONDS,
        }),
        metricsRepo.getTopIssuesByOccurrences({
          organizationId,
          projectId: input.projectId,
          since,
          limit: TOP_ISSUES_LIMIT,
        }),
        projectRepo.getCurrentIssueStateCounts(input.projectId),
        projectRepo.getIssueLifecycleEvents(input.projectId, since),
      ],
      { concurrency: "unbounded" },
    )

    // Hydrate top-issue names from PG. Skip the round-trip when the CH
    // side returned no rows.
    const topIssueIds = topOccurrences.map((row) => row.issueId)
    const namesById =
      topIssueIds.length > 0 ? yield* projectRepo.findIssueNamesByIds(topIssueIds) : new Map<IssueId, string>()

    const traceByKey = denseCountSeries(traceBuckets, buckets)
    const annotationByKey = denseAnnotationSeries(annotationBuckets, buckets)
    const activity: ProjectMetricsActivityPoint[] = buckets.map((bucket) => {
      const key = bucket.toISOString()
      const annotation = annotationByKey.get(key) ?? { passed: 0, failed: 0 }
      return {
        bucketStart: key,
        traceCount: traceByKey.get(key) ?? 0,
        annotationsPassed: annotation.passed,
        annotationsFailed: annotation.failed,
      }
    })

    const issuesLifecycle = composeIssueLifecycleTimeline({ snapshot, events, buckets })

    const eventsById = new Map<IssueId, ProjectIssueLifecycleEvent>()
    for (const event of events) {
      eventsById.set(event.issueId, event)
    }

    const topIssues: ProjectTopIssue[] = topOccurrences.map((row) => {
      const event = eventsById.get(row.issueId)
      // An issue with non-zero occurrences in the window may still have
      // no lifecycle event in the same window (it was created long ago
      // and has had no state transition recently). Default to "untracked"
      // for those — they're never "tracked" without an evaluation, and
      // we only have the lifecycle event source to tell us about evals.
      // Adapter layer (PG) is responsible for filling that gap if/when
      // we want a stricter "is this currently tracked?" signal — for v1
      // the heuristic is good enough.
      return {
        id: row.issueId,
        name: namesById.get(row.issueId) ?? row.issueId,
        occurrences: row.occurrences,
        lastSeenAt: row.lastSeenAt,
        state: event ? currentIssueState(event) : "untracked",
      }
    })

    return {
      windowEnd: now,
      windowDays,
      activity,
      issuesLifecycle,
      topIssues,
    }
  }).pipe(Effect.withSpan("admin.getProjectMetrics"))
