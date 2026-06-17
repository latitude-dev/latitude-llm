import type { SignalOccurrenceBucket } from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, SignalId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getSignalTrendUseCase } from "./get-issue-trend.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const signalId = SignalId("i".repeat(24))

interface HistogramCall {
  readonly from: Date
  readonly to: Date
  readonly bucketSeconds: number
  readonly signalIds: readonly string[]
}

const buildLayer = (input: { readonly buckets?: readonly SignalOccurrenceBucket[] } = {}) => {
  const calls: HistogramCall[] = []
  const { repository } = createFakeScoreAnalyticsRepository({
    histogramBySignals: ({ signalIds, timeRange, bucketSeconds }) =>
      Effect.sync(() => {
        calls.push({
          from: timeRange.from ?? new Date(0),
          to: timeRange.to ?? new Date(0),
          bucketSeconds,
          signalIds: signalIds.map((id) => id as string),
        })
        return input.buckets ?? []
      }),
  })

  return {
    calls,
    layer: Layer.mergeAll(
      Layer.succeed(ScoreAnalyticsRepository, repository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  }
}

describe("getSignalTrendUseCase", () => {
  it("defaults to the trailing 14-day window with 12h UTC-aligned buckets", async () => {
    const { calls, layer } = buildLayer()
    const now = new Date("2026-04-15T12:34:56.000Z")

    const result = await Effect.runPromise(
      getSignalTrendUseCase({ organizationId, projectId, signalId, now }).pipe(Effect.provide(layer)),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.bucketSeconds).toBe(12 * 60 * 60)
    expect(calls[0]?.signalIds).toEqual([signalId])
    // `to` snaps to end-of-day UTC.
    expect(calls[0]?.to.toISOString()).toBe("2026-04-15T23:59:59.999Z")
    // `from` snaps to start-of-day UTC, 13 days back from `to`.
    expect(calls[0]?.from.toISOString()).toBe("2026-04-02T00:00:00.000Z")
    // 14 days × 2 buckets per day = 28 entries, all filled.
    expect(result.buckets).toHaveLength(28)
  })

  it("honors an explicit `from`/`to` range and snaps to UTC day boundaries", async () => {
    const { calls, layer } = buildLayer()
    const from = new Date("2026-03-10T14:00:00.000Z")
    const to = new Date("2026-03-12T03:00:00.000Z")

    await Effect.runPromise(
      getSignalTrendUseCase({ organizationId, projectId, signalId, from, to }).pipe(Effect.provide(layer)),
    )

    expect(calls[0]?.from.toISOString()).toBe("2026-03-10T00:00:00.000Z")
    expect(calls[0]?.to.toISOString()).toBe("2026-03-12T23:59:59.999Z")
  })

  it("fills empty buckets with `count: 0` while preserving repo counts on matching keys", async () => {
    const { layer } = buildLayer({
      buckets: [{ bucket: "2026-04-15T00:00:00.000Z", count: 7 }],
    })

    const result = await Effect.runPromise(
      getSignalTrendUseCase({
        organizationId,
        projectId,
        signalId,
        from: new Date("2026-04-15T00:00:00.000Z"),
        to: new Date("2026-04-15T23:59:59.999Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(result.buckets).toEqual([
      { bucket: "2026-04-15T00:00:00.000Z", count: 7 },
      { bucket: "2026-04-15T12:00:00.000Z", count: 0 },
    ])
  })
})
