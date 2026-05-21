import { type IssueOccurrenceBucket, type IssueWindowMetric, ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Issue, IssueState } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import type { IssueLifecycleFlags } from "../ports/issue-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { getIssueAnalyticsUseCase } from "./get-issue-analytics.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const issueIdA = IssueId("a".repeat(24))
const issueIdB = IssueId("b".repeat(24))
const issueIdC = IssueId("c".repeat(24))

const makeIssue = (overrides: Partial<Issue> & { id: Issue["id"] }): Issue => ({
  organizationId: organizationId as string,
  projectId: projectId as string,
  slug: `issue-${(overrides.id as string).slice(0, 4)}`,
  name: "Issue",
  description: "An issue",
  source: "annotation",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  ...overrides,
})

const buildLayer = (input: {
  readonly issues?: readonly Issue[]
  readonly lifecycle?: ReadonlyMap<string, IssueLifecycleFlags>
  readonly windowMetrics?: readonly IssueWindowMetric[]
  readonly histogramBuckets?: readonly IssueOccurrenceBucket[]
  readonly captureHistogramBucketSeconds?: (seconds: number) => void
  readonly captureWindow?: (range: { from: Date | undefined; to: Date | undefined }) => void
}) => {
  const issueRepo = createFakeIssueRepository(
    input.issues ?? [],
    undefined,
    input.lifecycle ? { lifecycle: input.lifecycle } : {},
  )
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    listIssueWindowMetrics: ({ timeRange }) =>
      Effect.sync(() => {
        input.captureWindow?.({ from: timeRange?.from, to: timeRange?.to })
        return input.windowMetrics ?? []
      }),
    histogramByIssues: ({ bucketSeconds }) =>
      Effect.sync(() => {
        input.captureHistogramBucketSeconds?.(bucketSeconds)
        return input.histogramBuckets ?? []
      }),
  })
  return {
    issueRepo,
    layer: Layer.mergeAll(
      Layer.succeed(IssueRepository, issueRepo.repository),
      Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    ),
  }
}

describe("getIssueAnalyticsUseCase", () => {
  it("returns the zero shape when no issues had activity in the window", async () => {
    const { layer } = buildLayer({ windowMetrics: [] })
    const now = new Date("2026-04-15T12:00:00.000Z")

    const result = await Effect.runPromise(
      getIssueAnalyticsUseCase({ organizationId, projectId, now }).pipe(Effect.provide(layer)),
    )

    expect(result.ongoing.total).toBe(0)
    expect(result.new.total).toBe(0)
    expect(result.escalating.total).toBe(0)
    expect(result.regressed.total).toBe(0)
    expect(result.resolved.total).toBe(0)
    expect(result.occurrences.total).toBe(0)
    expect(result.occurrences.buckets.every((b) => b.value === 0)).toBe(true)
    // Default range = 7 days × 2 12h buckets/day = 14 buckets.
    expect(result.occurrences.buckets.length).toBeGreaterThanOrEqual(14)
  })

  it("counts lifecycle states based on issues with window activity and surfaces the histogram", async () => {
    const newIssue = makeIssue({
      id: issueIdA,
      createdAt: new Date("2026-04-14T00:00:00.000Z"), // recent → NEW
      updatedAt: new Date("2026-04-14T00:00:00.000Z"),
    })
    const ongoingIssue = makeIssue({
      id: issueIdB,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    const resolvedIssue = makeIssue({
      id: issueIdC,
      resolvedAt: new Date("2026-04-10T00:00:00.000Z"),
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    })

    let captured: number | null = null
    let capturedWindow: { from: Date | undefined; to: Date | undefined } | null = null
    const { layer } = buildLayer({
      issues: [newIssue, ongoingIssue, resolvedIssue],
      lifecycle: new Map([[issueIdB as string, { isEscalating: true, isRegressed: false }]]),
      windowMetrics: [
        {
          issueId: issueIdA,
          occurrences: 3,
          firstSeenAt: new Date("2026-04-14T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-14T03:00:00.000Z"),
        },
        {
          issueId: issueIdB,
          occurrences: 5,
          firstSeenAt: new Date("2026-04-13T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-15T00:00:00.000Z"),
        },
        {
          issueId: issueIdC,
          occurrences: 2,
          firstSeenAt: new Date("2026-04-09T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-09T03:00:00.000Z"),
        },
      ],
      histogramBuckets: [{ bucket: "2026-04-15T00:00:00.000Z", count: 4 }],
      captureHistogramBucketSeconds: (seconds) => {
        captured = seconds
      },
      captureWindow: (window) => {
        capturedWindow = window
      },
    })

    const result = await Effect.runPromise(
      getIssueAnalyticsUseCase({
        organizationId,
        projectId,
        now: new Date("2026-04-15T12:00:00.000Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(captured).toBe(12 * 60 * 60)
    expect(capturedWindow).not.toBeNull()
    expect(result.occurrences.total).toBe(10)
    expect(result.new.total).toBe(1) // issueA
    expect(result.escalating.total).toBe(1) // issueB
    // Ongoing is mutually exclusive with the other lifecycle states; no issue
    // here is *just* ongoing, so the count is zero.
    expect(result.ongoing.total).toBe(0)
    expect(result.resolved.total).toBe(1) // issueC

    const occurrencesBucket = result.occurrences.buckets.find((b) => b.bucket === "2026-04-15T00:00:00.000Z")
    expect(occurrencesBucket?.value).toBe(4)
  })

  it("snaps explicit `from`/`to` to UTC day boundaries", async () => {
    let capturedWindow: { from: Date | undefined; to: Date | undefined } | null = null
    const { layer } = buildLayer({
      captureWindow: (window) => {
        capturedWindow = window
      },
    })

    await Effect.runPromise(
      getIssueAnalyticsUseCase({
        organizationId,
        projectId,
        from: new Date("2026-04-01T15:00:00.000Z"),
        to: new Date("2026-04-03T03:00:00.000Z"),
      }).pipe(Effect.provide(layer)),
    )

    const window = capturedWindow as { from: Date | undefined; to: Date | undefined } | null
    if (window === null) throw new Error("Expected capturedWindow to be set")
    expect(window.from?.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(window.to?.toISOString()).toBe("2026-04-03T23:59:59.999Z")
  })
})

// Suppress unused-symbol warnings — these are imported solely so the layer
// types resolve, but the test relies on the exported `IssueState` for
// future expansion. Reference once so Biome doesn't strip the import.
void IssueState
