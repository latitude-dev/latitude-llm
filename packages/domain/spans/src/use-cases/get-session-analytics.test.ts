import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { emptySessionMetrics, type SessionMetrics, SessionRepository } from "../ports/session-repository.ts"
import { emptyTraceTimeHistogramBucket, type TraceTimeHistogramBucket } from "../ports/trace-repository.ts"
import { createFakeSessionRepository } from "../testing/fake-session-repository.ts"
import { getSessionAnalyticsUseCase } from "./get-session-analytics.ts"

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
  readonly metrics?: SessionMetrics
  readonly histogramBuckets?: ReadonlyArray<TraceTimeHistogramBucket>
}) => {
  const calls: RepoCall[] = []
  const { repository } = createFakeSessionRepository({
    aggregateMetricsByProjectId: ({ filters }) =>
      Effect.sync(() => {
        const { fromIso, toIso } = parseRangeFromFilters(filters)
        calls.push({ kind: "aggregate", fromIso, toIso })
        return input.metrics ?? emptySessionMetrics()
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
      Layer.succeed(SessionRepository, repository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  }
}

describe("getSessionAnalyticsUseCase", () => {
  it("defaults to a trailing 7-day window with 12-hour UTC-aligned buckets", async () => {
    const { calls, layer } = buildLayer({})
    const now = new Date("2026-04-15T12:34:56.000Z")

    const result = await Effect.runPromise(
      getSessionAnalyticsUseCase({ organizationId, projectId, now }).pipe(Effect.provide(layer)),
    )

    expect(calls).toHaveLength(2)
    const histogramCall = calls.find((c) => c.kind === "histogram")
    if (!histogramCall) throw new Error("Expected a histogram call")
    expect(histogramCall.bucketSeconds).toBe(12 * 60 * 60)
    expect(histogramCall.fromIso).toBe("2026-04-08T12:34:56.000Z")
    expect(histogramCall.toIso).toBe("2026-04-15T12:34:56.000Z")
    expect(result.sessions.total).toBe(0)
    expect(result.traces.total).toBe(0)
    expect(result.cost.total).toBe(0)
    expect(result.duration.median).toBe(0)
    expect(result.sessions.buckets.length).toBeGreaterThanOrEqual(13)
    expect(result.sessions.buckets.every((b) => b.value === 0)).toBe(true)
  })

  it("sums session and trace counts from buckets and reads cost/tokens/duration from metrics", async () => {
    const metrics: SessionMetrics = {
      ...emptySessionMetrics(),
      costTotalMicrocents: { min: 0, max: 0, avg: 0, median: 0, sum: 300_000_000 },
      tokensTotal: { min: 0, max: 0, avg: 0, median: 0, sum: 4_200 },
      durationNs: { min: 0, max: 0, avg: 0, median: 2_000_000_000, sum: 0 },
      spanCount: { min: 0, max: 0, avg: 0, median: 0, sum: 12 },
    }
    const from = new Date("2026-04-14T00:00:00.000Z")
    const to = new Date("2026-04-14T12:00:00.000Z")
    const buckets: TraceTimeHistogramBucket[] = [
      { ...emptyTraceTimeHistogramBucket("2026-04-14T00:00:00.000Z"), sessionCount: 3, traceCount: 7 },
    ]
    const { layer } = buildLayer({ metrics, histogramBuckets: buckets })

    const result = await Effect.runPromise(
      getSessionAnalyticsUseCase({ organizationId, projectId, from, to }).pipe(Effect.provide(layer)),
    )

    expect(result.sessions.total).toBe(3)
    expect(result.traces.total).toBe(7)
    expect(result.cost.total).toBeCloseTo(3, 6) // 300_000_000 microcents → $3
    expect(result.tokens.total).toBe(4_200)
    expect(result.duration.median).toBeCloseTo(2, 6) // 2e9 ns → 2s
    expect(result.spans.total).toBe(12)
  })
})
