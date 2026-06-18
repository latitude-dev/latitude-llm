import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import {
  ScoreAnalyticsRepository,
  type ScoreAnalyticsTimeRange,
  type SignalOccurrenceAggregate,
  type SignalOccurrenceBucket,
  type SignalTagsTimeRange,
  type SignalTrendSeries,
  type SignalWindowMetric,
} from "@domain/scores"
import {
  type ChSqlClient,
  cuidSchema,
  type FilterCondition,
  type FilterSet,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type SignalId,
  type SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { pickTraceHistogramBucketSeconds, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { SIGNAL_PRIORITY_GROUPS, SIGNAL_PRIORITY_ORDER } from "../constants.ts"
import { type SignalPriority, type SignalSource, SignalState } from "../entities/issue.ts"
import { deriveSignalLifecycleStates, getEscalationOccurrenceThreshold } from "../helpers.ts"
import { buildHistogramBucketScaffold, fillBuckets } from "../histogram-buckets.ts"
import { SignalRepository, type SignalSearchCandidate, type SignalWithLifecycle } from "../ports/issue-repository.ts"

export const signalsLifecycleGroupSchema = z.enum(["active", "archived"])
export type SignalsLifecycleGroup = z.infer<typeof signalsLifecycleGroupSchema>

export const signalsSortFieldSchema = z.enum(["lastSeen", "occurrences", "state"])
export type SignalsSortField = z.infer<typeof signalsSortFieldSchema>

/** Sentinel accepted by the assignee filter to match issues with no assignee. */
export const UNASSIGNED_FILTER = "unassigned" as const

export const signalAssigneeFilterSchema = z.union([cuidSchema, z.literal(UNASSIGNED_FILTER)])
export type SignalAssigneeFilter = z.infer<typeof signalAssigneeFilterSchema>

/** Priority bucket of an issue in the always-grouped list; `"none"` = `priority: null`. */
export type SignalPriorityGroup = (typeof SIGNAL_PRIORITY_GROUPS)[number]

export const signalsSortDirectionSchema = z.enum(["asc", "desc"])
export type SignalsSortDirection = z.infer<typeof signalsSortDirectionSchema>

export const signalsTimeRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
})

export const signalSearchSchema = z.object({
  query: z.string().min(1),
  normalizedEmbedding: z.array(z.number()),
})

const listSignalsInputSchema = z.object({
  organizationId: cuidSchema.transform(OrganizationId),
  projectId: cuidSchema.transform(ProjectId),
  /**
   * Restrict the result to a specific subset of issues. Skips the
   * windowMetrics-driven candidate selection so callers can fetch a known
   * issue even when it had no activity in the selected time range — the
   * use-case returns it with synthetic zero metrics in that case.
   */
  signalIds: z.array(signalIdSchema).optional(),
  lifecycleGroup: signalsLifecycleGroupSchema.optional(),
  /** Restrict to issues assigned to any of these users; `"unassigned"` matches `assigneeId: null`. */
  assigneeIds: z.array(signalAssigneeFilterSchema).min(1).optional(),
  search: signalSearchSchema.optional(),
  timeRange: signalsTimeRangeSchema.optional(),
  sort: z
    .object({
      field: signalsSortFieldSchema.default("lastSeen"),
      direction: signalsSortDirectionSchema.default("desc"),
    })
    .default({
      field: "lastSeen",
      direction: "desc",
    }),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  now: z.date().optional(),
})

export type ListSignalsInput = z.input<typeof listSignalsInputSchema>
export type ListSignalsError = RepositoryError

export interface SignalListAnalyticsCounts {
  readonly newSignals: number
  readonly escalatingSignals: number
  readonly ongoingSignals: number
  readonly regressedSignals: number
  readonly resolvedSignals: number
  readonly seenOccurrences: number
}

export interface SignalListAnalytics {
  readonly counts: SignalListAnalyticsCounts
  readonly histogram: readonly SignalOccurrenceBucket[]
  /**
   * Width (seconds) of each `histogram` bucket. Adaptive — picked from the time range so a
   * 6-day default lands at ~3h–4h bars and longer ranges step up to 12h, 1d, 1w. Bucket keys
   * are ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS.000Z`).
   */
  readonly histogramBucketSeconds: number
  readonly totalTraces: number
}

export interface SignalListItem {
  readonly id: string
  readonly projectId: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly source: SignalSource
  readonly states: readonly string[]
  readonly assigneeId: string | null
  readonly priority: SignalPriority | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly escalatedAt: Date | null
  readonly resolvedAt: Date | null
  readonly ignoredAt: Date | null
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly occurrences: number
  readonly similarityScore: number | null
  readonly affectedTracesPercent: number
  readonly escalationOccurrenceThreshold: number | null
  readonly trend: readonly SignalOccurrenceBucket[]
  readonly evaluations: readonly Evaluation[]
  readonly tags: readonly string[]
}

export interface ListSignalsResult {
  readonly analytics: SignalListAnalytics
  readonly items: readonly SignalListItem[]
  readonly totalCount: number
  readonly hasMore: boolean
  /** True when the project has at least one issue, regardless of lifecycle group or activity window. */
  readonly hasAnySignals: boolean
  readonly limit: number
  readonly offset: number
  readonly occurrencesSum: number
  /**
   * Signal count per priority group over the fully filtered table set (all
   * pages), so group headers can show complete totals before every page is
   * loaded.
   */
  readonly priorityCounts: Readonly<Record<SignalPriorityGroup, number>>
  /**
   * Signal count per assignee (`"unassigned"` for null) over the lifecycle-,
   * search-, and time-filtered set but BEFORE the assignee filter — a
   * "My issues" badge must not zero itself when its own filter is active.
   */
  readonly assigneeCounts: Readonly<Record<string, number>>
}

interface AnalyticsCandidate {
  readonly issue: SignalWithLifecycle
  readonly windowMetric: SignalWindowMetric
  readonly lifecycleStates: readonly string[]
  readonly similarityScore: number | null
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly escalationOccurrenceThreshold: number | null
}

const toUtcDayStart = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0))

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const resolveHistogramTimeRange = (input: {
  readonly timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined
  readonly now: Date
}): { readonly from: Date; readonly to: Date } => {
  if (input.timeRange?.from && input.timeRange?.to) {
    return {
      from: toUtcDayStart(input.timeRange.from),
      to: toUtcDayEnd(input.timeRange.to),
    }
  }

  if (input.timeRange?.from) {
    return {
      from: toUtcDayStart(input.timeRange.from),
      to: toUtcDayEnd(input.now),
    }
  }

  const end = toUtcDayEnd(input.timeRange?.to ?? input.now)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  start.setUTCHours(0, 0, 0, 0)

  return {
    from: start,
    to: end,
  }
}

const resolveTrendTimeRange = (input: {
  readonly timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined
  readonly now: Date
}): { readonly from: Date; readonly to: Date } => {
  const end = toUtcDayEnd(input.timeRange?.to ?? input.timeRange?.from ?? input.now)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 13)
  start.setUTCHours(0, 0, 0, 0)

  return {
    from: start,
    to: end,
  }
}

/**
 * Tag aggregation needs an explicit lower-bound time so CH scans on `scores`
 * and `traces` stay partition-pruned (see `aggregateTagsBySignals` impl). If
 * the operator selected a range we honor it; otherwise we fall back to ~30
 * days, which captures effectively all currently-relevant tags while still
 * pinning the scan to a small number of monthly partitions.
 *
 * Exported so other call sites that fetch tags for the same issues
 * (e.g. the issue detail handler) can use the same window and stay visually
 * consistent with the list.
 */
export const TAG_AGGREGATION_FALLBACK_DAYS = 30

const resolveTagsTimeRange = (input: {
  readonly timeRange: ScoreAnalyticsTimeRange | undefined
  readonly now: Date
}): SignalTagsTimeRange => {
  if (input.timeRange?.from) {
    return input.timeRange.to ? { from: input.timeRange.from, to: input.timeRange.to } : { from: input.timeRange.from }
  }
  const to = input.timeRange?.to ?? input.now
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - TAG_AGGREGATION_FALLBACK_DAYS)
  return { from, to }
}

const toScoreAnalyticsTimeRange = (
  timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined,
): ScoreAnalyticsTimeRange | undefined => {
  const normalized: {
    from?: Date
    to?: Date
  } = {}

  if (timeRange?.from !== undefined) {
    normalized.from = timeRange.from
  }

  if (timeRange?.to !== undefined) {
    normalized.to = timeRange.to
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

/**
 * Daily UTC scaffold producing `YYYY-MM-DD` keys. Used by the table mini-bar trend (always 14
 * days, daily) — kept as-is so the row-level trend stays compact and readable.
 */
const buildBucketScaffold = (input: { readonly from: Date; readonly to: Date }): readonly string[] => {
  const buckets: string[] = []
  const cursor = new Date(input.from)
  cursor.setUTCHours(0, 0, 0, 0)

  while (cursor.getTime() <= input.to.getTime()) {
    buckets.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return buckets
}

const matchesLifecycleGroup = (
  candidate: AnalyticsCandidate,
  lifecycleGroup: SignalsLifecycleGroup | undefined,
): boolean => {
  if (lifecycleGroup === undefined) {
    return true
  }

  const isArchived = candidate.issue.ignoredAt !== null || candidate.lifecycleStates.includes(SignalState.Resolved)
  return lifecycleGroup === "archived" ? isArchived : !isArchived
}

const matchesAssigneeFilter = (
  candidate: AnalyticsCandidate,
  assigneeIds: readonly SignalAssigneeFilter[] | undefined,
): boolean => {
  if (assigneeIds === undefined) {
    return true
  }

  return assigneeIds.includes(candidate.issue.assigneeId ?? UNASSIGNED_FILTER)
}

const toPriorityGroup = (priority: SignalPriority | null): SignalPriorityGroup => priority ?? "none"

const emptyPriorityCounts = (): Record<SignalPriorityGroup, number> =>
  Object.fromEntries(SIGNAL_PRIORITY_GROUPS.map((group) => [group, 0])) as Record<SignalPriorityGroup, number>

const toPriorityCounts = (candidates: readonly AnalyticsCandidate[]): Record<SignalPriorityGroup, number> => {
  const counts = emptyPriorityCounts()
  for (const candidate of candidates) {
    counts[toPriorityGroup(candidate.issue.priority)] += 1
  }
  return counts
}

const toAssigneeCounts = (candidates: readonly AnalyticsCandidate[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const candidate of candidates) {
    const key = candidate.issue.assigneeId ?? UNASSIGNED_FILTER
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

const compareDesc = (left: number, right: number): number => right - left
const compareAsc = (left: number, right: number): number => left - right

const LIFECYCLE_STATE_PRIORITY: Record<string, number> = {
  [SignalState.Regressed]: 0,
  [SignalState.Escalating]: 1,
  [SignalState.New]: 2,
  [SignalState.Ongoing]: 3,
  [SignalState.Resolved]: 4,
  [SignalState.Ignored]: 5,
}

const UNKNOWN_STATE_PRIORITY = 99

const getPrimaryStatePriority = (states: readonly string[]): number => {
  let best = UNKNOWN_STATE_PRIORITY
  for (const state of states) {
    const priority = LIFECYCLE_STATE_PRIORITY[state]
    if (priority !== undefined && priority < best) {
      best = priority
    }
  }
  return best
}

const sortCandidates = (
  candidates: readonly AnalyticsCandidate[],
  input: {
    readonly field: SignalsSortField
    readonly direction: SignalsSortDirection
    readonly hasSearch: boolean
  },
): readonly AnalyticsCandidate[] =>
  [...candidates].sort((left, right) => {
    // Priority grouping is the unconditional primary key: the list is always
    // grouped Urgent → High → Medium → Low → No priority, and the
    // user-selected sort applies within each group. Unconditional so exports,
    // bulk pagination, and issue prev/next stay consistent with the web list.
    const priorityComparison = compareAsc(
      SIGNAL_PRIORITY_ORDER[toPriorityGroup(left.issue.priority)],
      SIGNAL_PRIORITY_ORDER[toPriorityGroup(right.issue.priority)],
    )
    if (priorityComparison !== 0) {
      return priorityComparison
    }

    if (input.field === "occurrences") {
      const occurrencesComparison =
        input.direction === "asc"
          ? compareAsc(left.windowMetric.occurrences, right.windowMetric.occurrences)
          : compareDesc(left.windowMetric.occurrences, right.windowMetric.occurrences)
      if (occurrencesComparison !== 0) {
        return occurrencesComparison
      }
    } else if (input.field === "state") {
      // Priority numbers go low → high in importance order
      // (`Regressed = 0`, `Escalating = 1`, …, `Ignored = 5`). The user-
      // facing convention is "sort by state descending = highest-priority
      // first", so `desc` keeps the smaller priority number on top and
      // `asc` flips that — opposite to the raw numeric comparison.
      const leftPriority = getPrimaryStatePriority(left.lifecycleStates)
      const rightPriority = getPrimaryStatePriority(right.lifecycleStates)
      const stateComparison =
        input.direction === "asc" ? compareDesc(leftPriority, rightPriority) : compareAsc(leftPriority, rightPriority)
      if (stateComparison !== 0) {
        return stateComparison
      }
    } else {
      const lastSeenComparison =
        input.direction === "asc"
          ? compareAsc(left.lastSeenAt.getTime(), right.lastSeenAt.getTime())
          : compareDesc(left.lastSeenAt.getTime(), right.lastSeenAt.getTime())
      if (lastSeenComparison !== 0) {
        return lastSeenComparison
      }

      const occurrencesComparison = compareDesc(left.windowMetric.occurrences, right.windowMetric.occurrences)
      if (occurrencesComparison !== 0) {
        return occurrencesComparison
      }
    }

    const lastSeenComparison = compareDesc(left.lastSeenAt.getTime(), right.lastSeenAt.getTime())
    if (lastSeenComparison !== 0) {
      return lastSeenComparison
    }

    if (input.hasSearch) {
      const similarityComparison = compareDesc(left.similarityScore ?? 0, right.similarityScore ?? 0)
      if (similarityComparison !== 0) {
        return similarityComparison
      }
    }

    return left.issue.id.localeCompare(right.issue.id)
  })

const toCandidate = (input: {
  readonly issue: SignalWithLifecycle
  readonly windowMetric: SignalWindowMetric
  readonly occurrence: SignalOccurrenceAggregate | null
  readonly similarityScore: number | null
  readonly now: Date
}): AnalyticsCandidate => {
  const lifecycleStates = deriveSignalLifecycleStates({
    issue: input.issue,
    isEscalating: input.issue.lifecycle.isEscalating,
    isRegressed: input.issue.lifecycle.isRegressed,
    now: input.now,
  })

  return {
    issue: input.issue,
    windowMetric: input.windowMetric,
    lifecycleStates,
    similarityScore: input.similarityScore,
    firstSeenAt: input.occurrence?.firstSeenAt ?? input.windowMetric.firstSeenAt ?? input.issue.createdAt,
    lastSeenAt: input.occurrence?.lastSeenAt ?? input.windowMetric.lastSeenAt ?? input.issue.createdAt,
    escalationOccurrenceThreshold:
      input.occurrence !== null ? getEscalationOccurrenceThreshold(input.occurrence.baselineAvgOccurrences) : null,
  }
}

const toAnalyticsCounts = (candidates: readonly AnalyticsCandidate[]): SignalListAnalyticsCounts => ({
  newSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.New)).length,
  escalatingSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Escalating))
    .length,
  ongoingSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Ongoing)).length,
  regressedSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Regressed)).length,
  resolvedSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Resolved)).length,
  seenOccurrences: candidates.reduce((sum, candidate) => sum + candidate.windowMetric.occurrences, 0),
})

export const listSignalsUseCase = (
  input: ListSignalsInput,
): Effect.Effect<
  ListSignalsResult,
  ListSignalsError,
  ChSqlClient | EvaluationRepository | SignalRepository | ScoreAnalyticsRepository | SqlClient | TraceRepository
> =>
  Effect.gen(function* () {
    const parsed = listSignalsInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    const signalRepository = yield* SignalRepository
    const now = parsed.now ?? new Date()
    const selectedTimeRange = toScoreAnalyticsTimeRange(parsed.timeRange)

    let hasAnySignals = parsed.signalIds !== undefined
    if (!parsed.signalIds) {
      const firstSignalPage = yield* signalRepository.list({
        projectId: parsed.projectId,
        limit: 1,
        offset: 0,
      })
      hasAnySignals = firstSignalPage.items.length > 0

      if (!hasAnySignals) {
        const histogramTimeRange = resolveHistogramTimeRange({
          timeRange: parsed.timeRange,
          now,
        })
        const histogramBucketSeconds = pickTraceHistogramBucketSeconds(
          histogramTimeRange.from.getTime(),
          histogramTimeRange.to.getTime(),
        )
        const histogramScaffold = buildHistogramBucketScaffold({
          from: histogramTimeRange.from,
          to: histogramTimeRange.to,
          bucketSeconds: histogramBucketSeconds,
        })

        return {
          analytics: {
            counts: {
              newSignals: 0,
              escalatingSignals: 0,
              ongoingSignals: 0,
              regressedSignals: 0,
              resolvedSignals: 0,
              seenOccurrences: 0,
            },
            histogram: fillBuckets({ scaffold: histogramScaffold, buckets: [] }),
            histogramBucketSeconds,
            totalTraces: 0,
          },
          items: [],
          totalCount: 0,
          hasMore: false,
          hasAnySignals,
          limit: parsed.limit,
          offset: parsed.offset,
          occurrencesSum: 0,
          priorityCounts: emptyPriorityCounts(),
          assigneeCounts: {},
        } satisfies ListSignalsResult
      }
    }

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const evaluationRepository = yield* EvaluationRepository
    const traceRepository = yield* TraceRepository

    const windowMetricsEffect = scoreAnalyticsRepository.listSignalWindowMetrics({
      organizationId: parsed.organizationId,
      projectId: parsed.projectId,
      ...(selectedTimeRange ? { timeRange: selectedTimeRange } : {}),
      ...(parsed.signalIds ? { signalIds: parsed.signalIds } : {}),
    })

    const searchCandidatesEffect = parsed.search
      ? signalRepository.hybridSearch({
          projectId: parsed.projectId,
          query: parsed.search.query,
          normalizedEmbedding: parsed.search.normalizedEmbedding,
        })
      : Effect.succeed([] satisfies readonly SignalSearchCandidate[])

    // The denominator for `affectedTracesPercent` must be counted against
    // `traces.start_time` (not `scores.created_at`) so the percentage stays
    // consistent with what the web table shows and with the totals other
    // trace-side endpoints report. Async scoring can produce `scores` whose
    // `created_at` falls outside the trace's `start_time` window, which would
    // otherwise drift the numerator and denominator out of sync.
    const startTimeConditions: FilterCondition[] = []
    if (parsed.timeRange?.from) {
      startTimeConditions.push({ op: "gte", value: parsed.timeRange.from.toISOString() })
    }
    if (parsed.timeRange?.to) {
      startTimeConditions.push({ op: "lte", value: parsed.timeRange.to.toISOString() })
    }
    const traceCountFilters: FilterSet | undefined =
      startTimeConditions.length > 0 ? { startTime: startTimeConditions } : undefined

    const [windowMetrics, searchCandidates, totalTraces] = yield* Effect.all([
      windowMetricsEffect,
      searchCandidatesEffect,
      traceRepository.countByProjectId({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        ...(traceCountFilters ? { filters: traceCountFilters } : {}),
      }),
    ])

    const windowMetricsBySignalId = new Map(windowMetrics.map((metric) => [metric.signalId, metric] as const))
    const baseCandidateIds = parsed.search
      ? searchCandidates
          .map((candidate) => candidate.signalId)
          .filter((signalId) => windowMetricsBySignalId.has(signalId))
      : windowMetrics.map((metric) => metric.signalId)
    // When the caller passed an explicit `signalIds` filter, include those
    // issues in the candidate set even if they had no activity in the
    // window — they get synthesized zero `windowMetric` rows below so the
    // analytics pipeline still produces a stable shape.
    const candidateSignalIds = parsed.signalIds
      ? Array.from(new Set<SignalId>([...baseCandidateIds, ...parsed.signalIds]))
      : baseCandidateIds
    const histogramTimeRange = resolveHistogramTimeRange({
      timeRange: parsed.timeRange,
      now,
    })
    // Pick a "nice" bucket width adaptively so a 6-day default window lands at ~3h–4h bars while
    // longer user-selected ranges step up to 6h, 12h, 1d, etc. Same helper the Traces histogram
    // uses, keeping the two views visually consistent.
    const histogramBucketSeconds = pickTraceHistogramBucketSeconds(
      histogramTimeRange.from.getTime(),
      histogramTimeRange.to.getTime(),
    )
    const histogramScaffold = buildHistogramBucketScaffold({
      from: histogramTimeRange.from,
      to: histogramTimeRange.to,
      bucketSeconds: histogramBucketSeconds,
    })

    if (candidateSignalIds.length === 0) {
      return {
        analytics: {
          counts: {
            newSignals: 0,
            escalatingSignals: 0,
            ongoingSignals: 0,
            regressedSignals: 0,
            resolvedSignals: 0,
            seenOccurrences: 0,
          },
          histogram: fillBuckets({ scaffold: histogramScaffold, buckets: [] }),
          histogramBucketSeconds,
          totalTraces,
        },
        items: [],
        totalCount: 0,
        hasMore: false,
        hasAnySignals,
        limit: parsed.limit,
        offset: parsed.offset,
        occurrencesSum: 0,
        priorityCounts: emptyPriorityCounts(),
        assigneeCounts: {},
      } satisfies ListSignalsResult
    }

    const searchScoresBySignalId = new Map(
      searchCandidates.map((candidate) => [candidate.signalId, candidate.score] as const),
    )
    const forceIncludeSignalIds = parsed.signalIds ? new Set<string>(parsed.signalIds) : null
    const canonicalSignals = yield* signalRepository.findByIds({
      projectId: parsed.projectId,
      signalIds: candidateSignalIds,
    })

    const matchedSignalIds = canonicalSignals.map((issue) => issue.id)
    const fullHistoryOccurrences =
      matchedSignalIds.length === 0
        ? []
        : yield* scoreAnalyticsRepository.aggregateBySignals({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            signalIds: matchedSignalIds,
          })
    const occurrencesBySignalId = new Map(
      fullHistoryOccurrences.map((occurrence) => [occurrence.signalId, occurrence] as const),
    )

    const analyticsCandidates = canonicalSignals
      .map((issue) => {
        const windowMetric = windowMetricsBySignalId.get(issue.id) ?? null
        // Signals without window metrics are normally filtered out — but when
        // the caller passed `signalIds`, force-include them with a synthesized
        // zero-activity metric so a point-lookup over a known issue id still
        // returns a stable analytics shape.
        if (!windowMetric && !forceIncludeSignalIds?.has(issue.id)) {
          return null
        }

        return toCandidate({
          issue,
          windowMetric: windowMetric ?? ({ signalId: issue.id, occurrences: 0 } as unknown as SignalWindowMetric),
          occurrence: occurrencesBySignalId.get(issue.id) ?? null,
          similarityScore: searchScoresBySignalId.get(issue.id) ?? null,
          now,
        })
      })
      .filter((candidate): candidate is AnalyticsCandidate => candidate !== null)

    const analyticsHistogram =
      matchedSignalIds.length === 0
        ? []
        : yield* scoreAnalyticsRepository.histogramBySignals({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            signalIds: matchedSignalIds,
            timeRange: histogramTimeRange,
            bucketSeconds: histogramBucketSeconds,
          })

    const lifecycleCandidates = analyticsCandidates.filter((candidate) =>
      matchesLifecycleGroup(candidate, parsed.lifecycleGroup),
    )
    // Computed before the assignee filter: the "My issues" badge must keep
    // reflecting the lifecycle/search/time scope while its own filter is on.
    const assigneeCounts = toAssigneeCounts(lifecycleCandidates)
    const tableCandidates = sortCandidates(
      lifecycleCandidates.filter((candidate) => matchesAssigneeFilter(candidate, parsed.assigneeIds)),
      {
        field: parsed.sort.field,
        direction: parsed.sort.direction,
        hasSearch: parsed.search !== undefined,
      },
    )
    const priorityCounts = toPriorityCounts(tableCandidates)

    const occurrencesSum = tableCandidates.reduce((sum, candidate) => sum + candidate.windowMetric.occurrences, 0)
    const pageCandidates = tableCandidates.slice(parsed.offset, parsed.offset + parsed.limit)
    const pageSignalIds = pageCandidates.map((candidate) => candidate.issue.id)
    const trendTimeRange = resolveTrendTimeRange({
      timeRange: parsed.timeRange,
      now,
    })
    const trendScaffold = buildBucketScaffold(trendTimeRange)
    const tagsTimeRange = resolveTagsTimeRange({ timeRange: selectedTimeRange, now })

    const [evaluationPage, trendSeries, tagsAggregates] = yield* Effect.all([
      pageSignalIds.length === 0
        ? Effect.succeed({
            items: [] as readonly Evaluation[],
            hasMore: false,
            limit: 0,
            offset: 0,
          })
        : evaluationRepository.listBySignalIds({
            projectId: parsed.projectId,
            signalIds: pageSignalIds,
            options: {
              lifecycle: "active",
              limit: 1000,
            },
          }),
      pageSignalIds.length === 0
        ? Effect.succeed([] satisfies readonly SignalTrendSeries[])
        : scoreAnalyticsRepository.trendBySignals({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            signalIds: pageSignalIds,
            timeRange: trendTimeRange,
          }),
      pageSignalIds.length === 0
        ? Effect.succeed([])
        : scoreAnalyticsRepository.aggregateTagsBySignals({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            signalIds: pageSignalIds,
            timeRange: tagsTimeRange,
          }),
    ])

    const evaluationsBySignalId = new Map<string, Evaluation[]>()
    for (const evaluation of evaluationPage.items) {
      const evaluations = evaluationsBySignalId.get(evaluation.signalId) ?? []
      evaluations.push(evaluation)
      evaluationsBySignalId.set(evaluation.signalId, evaluations)
    }

    const trendBySignalId = new Map(
      trendSeries.map((series) => [
        series.signalId,
        fillBuckets({
          scaffold: trendScaffold,
          buckets: series.buckets,
        }),
      ]),
    )

    const tagsBySignalId = new Map(tagsAggregates.map((entry) => [entry.signalId, entry.tags] as const))

    return {
      analytics: {
        counts: toAnalyticsCounts(analyticsCandidates),
        histogram: fillBuckets({
          scaffold: histogramScaffold,
          buckets: analyticsHistogram,
        }),
        histogramBucketSeconds,
        totalTraces,
      },
      items: pageCandidates.map((candidate) => ({
        id: candidate.issue.id,
        projectId: candidate.issue.projectId,
        slug: candidate.issue.slug,
        name: candidate.issue.name,
        description: candidate.issue.description,
        source: candidate.issue.source,
        states: candidate.lifecycleStates,
        assigneeId: candidate.issue.assigneeId,
        priority: candidate.issue.priority,
        createdAt: candidate.issue.createdAt,
        updatedAt: candidate.issue.updatedAt,
        escalatedAt: candidate.issue.escalatedAt,
        resolvedAt: candidate.issue.resolvedAt,
        ignoredAt: candidate.issue.ignoredAt,
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt,
        occurrences: candidate.windowMetric.occurrences,
        similarityScore: candidate.similarityScore,
        affectedTracesPercent: totalTraces === 0 ? 0 : Math.min(candidate.windowMetric.occurrences / totalTraces, 1),
        escalationOccurrenceThreshold: candidate.escalationOccurrenceThreshold,
        trend: trendBySignalId.get(candidate.issue.id) ?? fillBuckets({ scaffold: trendScaffold, buckets: [] }),
        evaluations: evaluationsBySignalId.get(candidate.issue.id) ?? [],
        tags: tagsBySignalId.get(candidate.issue.id) ?? [],
      })),
      totalCount: tableCandidates.length,
      hasMore: parsed.offset + parsed.limit < tableCandidates.length,
      hasAnySignals,
      limit: parsed.limit,
      offset: parsed.offset,
      occurrencesSum,
      priorityCounts,
      assigneeCounts,
    } satisfies ListSignalsResult
  }).pipe(Effect.withSpan("issues.listSignals"))
