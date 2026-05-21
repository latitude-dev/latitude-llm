import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { emptyTraceMetrics, type TraceMetrics, TraceRepository } from "../ports/trace-repository.ts"
import { createFakeTraceRepository } from "../testing/fake-trace-repository.ts"
import { getTraceAnalyticsUseCase } from "./get-trace-analytics.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

interface RepoCall {
  readonly kind: "aggregate" | "histogram"
  readonly fromIso: string | undefined
  readonly toIso: string | undefined
  readonly bucketSeconds?: number
}

const parseRangeFromFilters = (
  filters: { readonly startTime?: ReadonlyArray<{ op: string; value: unknown }> } | undefined,
): { fromIso: string | undefined; toIso: string | undefined } => {
  const conds = filters?.startTime ?? []
  let fromIso: string | undefined
  let toIso: string | undefined
  for (const c of conds) {
    if (c.op === "gte" && typeof c.value === "string") fromIso = c.value
    if (c.op === "lte" && typeof c.value === "string") toIso = c.value
  }
  return { fromIso, toIso }
}

const buildLayer = (input: {
  readonly metrics?: TraceMetrics
  readonly histogramBuckets?: ReadonlyArray<{
    bucketStart: string
    traceCount: number
    costTotalMicrocentsSum: number
    durationNsMedian: number
    tokensTotalSum: number
    spanCountSum: number
    timeToFirstTokenNsMedian: number
  }>
}) => {
  const calls: RepoCall[] = []
  const { repository } = createFakeTraceRepository({
    aggregateMetricsByProjectId: ({ filters }) =>
      Effect.sync(() => {
        const { fromIso, toIso } = parseRangeFromFilters(filters)
        calls.push({ kind: "aggregate", fromIso, toIso })
        return input.metrics ?? emptyTraceMetrics()
      }),
    histogramByProjectId: ({ filters, bucketSeconds }) =>
      Effect.sync(() => {
        const { fromIso, toIso } = parseRangeFromFilters(filters)
        calls.push({ kind: "histogram", fromIso, toIso, bucketSeconds })
        return input.histogramBuckets ?? []
      }),
  })
  return {
    calls,
    layer: Layer.mergeAll(
      Layer.succeed(TraceRepository, repository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  }
}

describe("getTraceAnalyticsUseCase", () => {
  it("defaults to a trailing 7-day window with 12-hour UTC-aligned buckets", async () => {
    const { calls, layer } = buildLayer({})
    const now = new Date("2026-04-15T12:34:56.000Z")

    const result = await Effect.runPromise(
      getTraceAnalyticsUseCase({ organizationId, projectId, now }).pipe(Effect.provide(layer)),
    )

    expect(calls).toHaveLength(2)
    const histogramCall = calls.find((c) => c.kind === "histogram")
    if (!histogramCall) throw new Error("Expected a histogram call")
    expect(histogramCall.bucketSeconds).toBe(12 * 60 * 60)
    expect(histogramCall.fromIso).toBe("2026-04-08T12:34:56.000Z")
    expect(histogramCall.toIso).toBe("2026-04-15T12:34:56.000Z")
    expect(result.traces.total).toBe(0)
    expect(result.cost.total).toBe(0)
    expect(result.duration.median).toBe(0)
    // 7-day range with 12h buckets → 14 bucket slots (start-inclusive, end-aligned).
    expect(result.traces.buckets.length).toBeGreaterThanOrEqual(13)
    expect(result.traces.buckets.every((b) => b.value === 0)).toBe(true)
  })

  it("uses the explicit `from`/`to` range when both are provided", async () => {
    const { calls, layer } = buildLayer({})
    const from = new Date("2026-03-01T00:00:00.000Z")
    const to = new Date("2026-03-03T00:00:00.000Z")

    await Effect.runPromise(
      getTraceAnalyticsUseCase({ organizationId, projectId, from, to }).pipe(Effect.provide(layer)),
    )

    for (const c of calls) {
      expect(c.fromIso).toBe(from.toISOString())
      expect(c.toIso).toBe(to.toISOString())
    }
  })

  it("derives totals from the histogram and surfaces medians from aggregateMetricsByProjectId", async () => {
    const metrics: TraceMetrics = {
      durationNs: { min: 0, max: 0, avg: 0, median: 1234, sum: 0 },
      costTotalMicrocents: { min: 0, max: 0, avg: 0, median: 0, sum: 9999 },
      spanCount: { min: 0, max: 0, avg: 0, median: 0, sum: 42 },
      tokensTotal: { min: 0, max: 0, avg: 0, median: 0, sum: 777 },
      timeToFirstTokenNs: { min: 0, max: 0, avg: 0, median: 555, sum: 0 },
    }
    const buckets = [
      {
        bucketStart: "2026-04-15T00:00:00.000Z",
        traceCount: 5,
        costTotalMicrocentsSum: 100,
        durationNsMedian: 1000,
        tokensTotalSum: 200,
        spanCountSum: 12,
        timeToFirstTokenNsMedian: 333,
      },
      {
        bucketStart: "2026-04-15T12:00:00.000Z",
        traceCount: 3,
        costTotalMicrocentsSum: 50,
        durationNsMedian: 800,
        tokensTotalSum: 150,
        spanCountSum: 4,
        timeToFirstTokenNsMedian: 222,
      },
    ] as const

    const { layer } = buildLayer({ metrics, histogramBuckets: buckets })

    const result = await Effect.runPromise(
      getTraceAnalyticsUseCase({
        organizationId,
        projectId,
        from: new Date("2026-04-15T00:00:00.000Z"),
        to: new Date("2026-04-15T23:59:59.999Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(result.traces.total).toBe(8)
    // 9999 microcents = 9999 / 100_000_000 USD
    expect(result.cost.total).toBeCloseTo(9999 / 100_000_000, 12)
    // 1234 nanoseconds = 1234 / 1_000_000_000 seconds
    expect(result.duration.median).toBeCloseTo(1234 / 1_000_000_000, 12)
    expect(result.tokens.total).toBe(777)
    expect(result.timeToFirstToken.median).toBeCloseTo(555 / 1_000_000_000, 12)
    expect(result.spans.total).toBe(42)
    expect(result.traces.buckets).toEqual([
      { bucket: "2026-04-15T00:00:00.000Z", value: 5 },
      { bucket: "2026-04-15T12:00:00.000Z", value: 3 },
    ])
    expect(result.duration.buckets[0]?.value).toBeCloseTo(1000 / 1_000_000_000, 12)
    expect(result.duration.buckets[1]?.value).toBeCloseTo(800 / 1_000_000_000, 12)
    expect(result.cost.buckets[0]?.value).toBeCloseTo(100 / 100_000_000, 12)
    expect(result.timeToFirstToken.buckets[0]?.value).toBeCloseTo(333 / 1_000_000_000, 12)
  })
})
