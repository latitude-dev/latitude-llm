import type { IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { composeIssueLifecycleTimeline, getProjectMetricsUseCase } from "./get-project-metrics.ts"
import { AdminProjectMetricsRepository } from "./project-metrics-repository.ts"
import {
  AdminProjectRepository,
  type ProjectIssueDetails,
  type ProjectIssueLifecycleEvent,
  type ProjectIssueStateSnapshot,
} from "./project-repository.ts"

const PROJECT_ID = "project-target" as ProjectId
const ORG_ID = "org-target" as OrganizationId
const issueId = (raw: string) => raw as IssueId

const NOW = new Date("2026-04-30T12:00:00Z")
const DAY_MS = 24 * 60 * 60 * 1000
const DAY_SECONDS = 24 * 60 * 60

const mkProjectDetails = () => ({
  id: PROJECT_ID,
  name: "Target",
  slug: "target",
  organization: { id: ORG_ID, name: "Org", slug: "org" },
  settings: null,
  firstTraceAt: null,
  lastEditedAt: NOW,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
})

const projectRepo = (overrides: {
  snapshot?: ProjectIssueStateSnapshot
  events?: readonly ProjectIssueLifecycleEvent[]
  details?: ReadonlyMap<IssueId, ProjectIssueDetails>
}) =>
  Layer.succeed(AdminProjectRepository, {
    findById: () => Effect.succeed(mkProjectDetails()),
    getCurrentIssueStateCounts: () => Effect.succeed(overrides.snapshot ?? { untracked: 0, tracked: 0, resolved: 0 }),
    getIssueLifecycleEvents: () => Effect.succeed(overrides.events ?? []),
    findIssueDetailsByIds: () => Effect.succeed(overrides.details ?? new Map<IssueId, ProjectIssueDetails>()),
  })

const metricsRepo = (overrides: {
  traces?: readonly { bucketStart: Date; count: number }[]
  annotations?: readonly { bucketStart: Date; passedCount: number; failedCount: number }[]
  topIssues?: readonly { issueId: IssueId; occurrences: number; lastSeenAt: Date }[]
}) =>
  Layer.succeed(AdminProjectMetricsRepository, {
    getTraceHistogram: () => Effect.succeed(overrides.traces ?? []),
    getAnnotationHistogram: () => Effect.succeed(overrides.annotations ?? []),
    getTopIssuesByOccurrences: () => Effect.succeed(overrides.topIssues ?? []),
  })

const startOfUtcDay = (msEpoch: number) => new Date(Math.floor(msEpoch / 1000 / DAY_SECONDS) * DAY_SECONDS * 1000)

/** Tiny helper so the deterministic-index test fixtures don't need `!` assertions. */
const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) throw new Error(`expected ${label} to be defined`)
  return value
}

describe("getProjectMetricsUseCase", () => {
  it("returns dense daily activity buckets across the window even when CH reports sparse data", async () => {
    const lastBucket = startOfUtcDay(NOW.getTime())
    const traceDay = new Date(lastBucket.getTime() - 2 * DAY_MS)

    const result = await Effect.runPromise(
      getProjectMetricsUseCase({ projectId: PROJECT_ID, now: NOW, windowDays: 5 }).pipe(
        Effect.provide(projectRepo({})),
        Effect.provide(metricsRepo({ traces: [{ bucketStart: traceDay, count: 7 }] })),
      ),
    )

    expect(result.activity).toHaveLength(5)
    expect(result.activity.map((p) => p.traceCount)).toEqual([0, 0, 7, 0, 0])
    expect(result.activity.every((p) => p.annotationsPassed === 0 && p.annotationsFailed === 0)).toBe(true)
  })

  it("threads annotation passed/failed counts through to the activity series", async () => {
    const lastBucket = startOfUtcDay(NOW.getTime())
    const today = lastBucket
    const yesterday = new Date(lastBucket.getTime() - DAY_MS)

    const result = await Effect.runPromise(
      getProjectMetricsUseCase({ projectId: PROJECT_ID, now: NOW, windowDays: 3 }).pipe(
        Effect.provide(projectRepo({})),
        Effect.provide(
          metricsRepo({
            annotations: [
              { bucketStart: yesterday, passedCount: 4, failedCount: 1 },
              { bucketStart: today, passedCount: 2, failedCount: 3 },
            ],
          }),
        ),
      ),
    )

    expect(result.activity.map((p) => [p.annotationsPassed, p.annotationsFailed])).toEqual([
      [0, 0],
      [4, 1],
      [2, 3],
    ])
  })

  it("composes a flat baseline-only lifecycle when there are no events in the window", async () => {
    const result = await Effect.runPromise(
      getProjectMetricsUseCase({ projectId: PROJECT_ID, now: NOW, windowDays: 3 }).pipe(
        Effect.provide(projectRepo({ snapshot: { untracked: 4, tracked: 2, resolved: 11 } })),
        Effect.provide(metricsRepo({})),
      ),
    )

    expect(result.issuesLifecycle).toHaveLength(3)
    for (const point of result.issuesLifecycle) {
      expect(point).toMatchObject({ untracked: 4, tracked: 2, resolved: 11 })
    }
  })

  it("hydrates top issue names + state from PG (independent of in-window events)", async () => {
    const result = await Effect.runPromise(
      getProjectMetricsUseCase({ projectId: PROJECT_ID, now: NOW, windowDays: 5 }).pipe(
        Effect.provide(
          projectRepo({
            // No in-window events for either id — exactly the scenario
            // where inferring from events would mislabel both as
            // "untracked". PG-side `findIssueDetailsByIds` gives us
            // the authoritative current state.
            details: new Map<IssueId, ProjectIssueDetails>([
              [issueId("a"), { name: "Tracked thing", state: "tracked" }],
              [issueId("b"), { name: "Bare thing", state: "untracked" }],
              [issueId("c"), { name: "Done thing", state: "resolved" }],
            ]),
          }),
        ),
        Effect.provide(
          metricsRepo({
            topIssues: [
              { issueId: issueId("a"), occurrences: 100, lastSeenAt: NOW },
              { issueId: issueId("b"), occurrences: 50, lastSeenAt: NOW },
              { issueId: issueId("c"), occurrences: 25, lastSeenAt: NOW },
            ],
          }),
        ),
      ),
    )

    expect(result.topIssues).toEqual([
      { id: "a", name: "Tracked thing", occurrences: 100, lastSeenAt: NOW, state: "tracked" },
      { id: "b", name: "Bare thing", occurrences: 50, lastSeenAt: NOW, state: "untracked" },
      { id: "c", name: "Done thing", occurrences: 25, lastSeenAt: NOW, state: "resolved" },
    ])
  })

  it("falls back to issue id + untracked when PG has no row for the id", async () => {
    const result = await Effect.runPromise(
      getProjectMetricsUseCase({ projectId: PROJECT_ID, now: NOW, windowDays: 5 }).pipe(
        Effect.provide(projectRepo({})),
        Effect.provide(metricsRepo({ topIssues: [{ issueId: issueId("orphan"), occurrences: 1, lastSeenAt: NOW }] })),
      ),
    )

    expect(result.topIssues[0]).toMatchObject({ id: "orphan", name: "orphan", state: "untracked" })
  })

  it("clamps oversized window requests to 90 days", async () => {
    const result = await Effect.runPromise(
      getProjectMetricsUseCase({ projectId: PROJECT_ID, now: NOW, windowDays: 9999 }).pipe(
        Effect.provide(projectRepo({})),
        Effect.provide(metricsRepo({})),
      ),
    )
    expect(result.windowDays).toBe(90)
    expect(result.activity).toHaveLength(90)
  })
})

describe("composeIssueLifecycleTimeline", () => {
  const buckets: Date[] = []
  for (let i = 4; i >= 0; i--) {
    buckets.push(new Date(startOfUtcDay(NOW.getTime()).getTime() - i * DAY_MS))
  }

  it("walks an issue from untracked → tracked → resolved over a 5-day window", () => {
    const days = buckets
    // Day 0 (oldest): created
    // Day 2: first eval attached
    // Day 4 (today): resolved
    const day0 = must(days[0], "day0")
    const day2 = must(days[2], "day2")
    const day4 = must(days[4], "day4")
    const events: ProjectIssueLifecycleEvent[] = [
      {
        issueId: issueId("walking"),
        createdAt: new Date(day0.getTime() + 1000),
        firstEvalAttachedAt: new Date(day2.getTime() + 1000),
        resolvedAt: new Date(day4.getTime() + 1000),
        ignoredAt: null,
      },
    ]

    const result = composeIssueLifecycleTimeline({
      snapshot: { untracked: 0, tracked: 0, resolved: 1 }, // 1 resolved today (matches the issue)
      events,
      buckets: days,
    })

    // Expected per day: untracked / tracked / resolved
    expect(result[0]).toMatchObject({ untracked: 1, tracked: 0, resolved: 0 })
    expect(result[1]).toMatchObject({ untracked: 1, tracked: 0, resolved: 0 })
    expect(result[2]).toMatchObject({ untracked: 0, tracked: 1, resolved: 0 })
    expect(result[3]).toMatchObject({ untracked: 0, tracked: 1, resolved: 0 })
    expect(result[4]).toMatchObject({ untracked: 0, tracked: 0, resolved: 1 })
  })

  it("treats `ignoredAt` as a resolution event", () => {
    const day0 = must(buckets[0], "day0")
    const day2 = must(buckets[2], "day2")
    const events: ProjectIssueLifecycleEvent[] = [
      {
        issueId: issueId("ig"),
        createdAt: new Date(day0.getTime() + 1000),
        firstEvalAttachedAt: null,
        resolvedAt: null,
        ignoredAt: new Date(day2.getTime() + 1000),
      },
    ]

    const result = composeIssueLifecycleTimeline({
      snapshot: { untracked: 0, tracked: 0, resolved: 1 },
      events,
      buckets,
    })

    expect(result[0]).toMatchObject({ untracked: 1, resolved: 0 })
    expect(result[1]).toMatchObject({ untracked: 1, resolved: 0 })
    expect(result[2]).toMatchObject({ untracked: 0, resolved: 1 })
    expect(result[4]).toMatchObject({ untracked: 0, resolved: 1 })
  })

  it("preserves a constant baseline of issues with no events in the window", () => {
    // 3 untracked, 1 tracked, 5 resolved overall — but only 1 untracked
    // issue has any event in the window. The remaining 2 untracked + 1
    // tracked + 5 resolved should appear as a flat baseline on every day.
    const day1 = must(buckets[1], "day1")
    const events: ProjectIssueLifecycleEvent[] = [
      {
        issueId: issueId("recent"),
        createdAt: new Date(day1.getTime() + 1000),
        firstEvalAttachedAt: null,
        resolvedAt: null,
        ignoredAt: null,
      },
    ]

    const result = composeIssueLifecycleTimeline({
      snapshot: { untracked: 3, tracked: 1, resolved: 5 },
      events,
      buckets,
    })

    // Today: snapshot. Day 0: "recent" hadn't been created yet, so only baseline.
    expect(result[0]).toMatchObject({ untracked: 2, tracked: 1, resolved: 5 })
    expect(result[4]).toMatchObject({ untracked: 3, tracked: 1, resolved: 5 })
  })
})
