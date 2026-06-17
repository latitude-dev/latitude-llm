import { type SignalOccurrenceBucket, type SignalWindowMetric, ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, SignalId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Signal, SignalState } from "../entities/issue.ts"
import { createSignalCentroid } from "../helpers.ts"
import type { SignalLifecycleFlags } from "../ports/issue-repository.ts"
import { SignalRepository } from "../ports/issue-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-issue-repository.ts"
import { getSignalAnalyticsUseCase } from "./get-issue-analytics.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const signalIdA = SignalId("a".repeat(24))
const signalIdB = SignalId("b".repeat(24))
const signalIdC = SignalId("c".repeat(24))

const makeSignal = (overrides: Partial<Signal> & { id: Signal["id"] }): Signal => ({
  organizationId: organizationId as string,
  projectId: projectId as string,
  slug: `issue-${(overrides.id as string).slice(0, 4)}`,
  name: "Signal",
  description: "An issue",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  ...overrides,
})

const buildLayer = (input: {
  readonly issues?: readonly Signal[]
  readonly lifecycle?: ReadonlyMap<string, SignalLifecycleFlags>
  readonly windowMetrics?: readonly SignalWindowMetric[]
  readonly histogramBuckets?: readonly SignalOccurrenceBucket[]
  readonly captureHistogramBucketSeconds?: (seconds: number) => void
  readonly captureWindow?: (range: { from: Date | undefined; to: Date | undefined }) => void
}) => {
  const signalRepo = createFakeSignalRepository(
    input.issues ?? [],
    undefined,
    input.lifecycle ? { lifecycle: input.lifecycle } : {},
  )
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    listSignalWindowMetrics: ({ timeRange }) =>
      Effect.sync(() => {
        input.captureWindow?.({ from: timeRange?.from, to: timeRange?.to })
        return input.windowMetrics ?? []
      }),
    histogramBySignals: ({ bucketSeconds }) =>
      Effect.sync(() => {
        input.captureHistogramBucketSeconds?.(bucketSeconds)
        return input.histogramBuckets ?? []
      }),
  })
  return {
    signalRepo,
    layer: Layer.mergeAll(
      Layer.succeed(SignalRepository, signalRepo.repository),
      Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    ),
  }
}

describe("getSignalAnalyticsUseCase", () => {
  it("returns the zero shape when no issues had activity in the window", async () => {
    const { layer } = buildLayer({ windowMetrics: [] })
    const now = new Date("2026-04-15T12:00:00.000Z")

    const result = await Effect.runPromise(
      getSignalAnalyticsUseCase({ organizationId, projectId, now }).pipe(Effect.provide(layer)),
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
    const newSignal = makeSignal({
      id: signalIdA,
      createdAt: new Date("2026-04-14T00:00:00.000Z"), // recent → NEW
      updatedAt: new Date("2026-04-14T00:00:00.000Z"),
    })
    const ongoingSignal = makeSignal({
      id: signalIdB,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    const resolvedSignal = makeSignal({
      id: signalIdC,
      resolvedAt: new Date("2026-04-10T00:00:00.000Z"),
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    })

    let captured: number | null = null
    let capturedWindow: { from: Date | undefined; to: Date | undefined } | null = null
    const { layer } = buildLayer({
      issues: [newSignal, ongoingSignal, resolvedSignal],
      lifecycle: new Map([[signalIdB as string, { isEscalating: true, isRegressed: false }]]),
      windowMetrics: [
        {
          signalId: signalIdA,
          occurrences: 3,
          firstSeenAt: new Date("2026-04-14T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-14T03:00:00.000Z"),
        },
        {
          signalId: signalIdB,
          occurrences: 5,
          firstSeenAt: new Date("2026-04-13T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-15T00:00:00.000Z"),
        },
        {
          signalId: signalIdC,
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
      getSignalAnalyticsUseCase({
        organizationId,
        projectId,
        now: new Date("2026-04-15T12:00:00.000Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(captured).toBe(12 * 60 * 60)
    expect(capturedWindow).not.toBeNull()
    expect(result.occurrences.total).toBe(10)
    expect(result.new.total).toBe(1) // signalA
    expect(result.escalating.total).toBe(1) // signalB
    // Ongoing is mutually exclusive with the other lifecycle states; no issue
    // here is *just* ongoing, so the count is zero.
    expect(result.ongoing.total).toBe(0)
    expect(result.resolved.total).toBe(1) // signalC

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
      getSignalAnalyticsUseCase({
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
// types resolve, but the test relies on the exported `SignalState` for
// future expansion. Reference once so Biome doesn't strip the import.
void SignalState
