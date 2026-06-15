import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { MetricSeriesTarget } from "../ports/metric-series-reader.ts"
import { createFakeMetricSeriesReader } from "../testing/fake-metric-series-reader.ts"
import { evaluateMetricAlert, evaluateMetricEscalatingAlert } from "./evaluate-metric-alert.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const now = new Date("2026-06-01T12:00:00.000Z")
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000)

// The fake reader counts seeded event times per window/bucket regardless of metric
// kind — so it exercises the threshold/window math; per-metric aggregation is the
// reader's job (covered by the platform chdb test). The metric kind here still
// drives the accumulating-vs-intensive normalization branch under test.
const target = (metric: MetricSeriesTarget["metric"]): MetricSeriesTarget => ({
  stream: "spans",
  filterSet: {},
  query: null,
  metric,
})

const runThreshold = (
  events: readonly Date[],
  t: MetricSeriesTarget,
  threshold: Parameters<typeof evaluateMetricAlert>[0]["condition"]["threshold"],
  direction: Parameters<typeof evaluateMetricAlert>[0]["condition"]["direction"] = "above",
) =>
  Effect.runPromise(
    evaluateMetricAlert({
      organizationId,
      projectId,
      target: t,
      condition: { kind: "metric.threshold", metric: t.metric, threshold, direction },
      now,
    }).pipe(
      Effect.provide(createFakeMetricSeriesReader(events).layer),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  )

describe("evaluateMetricAlert (metric.threshold)", () => {
  it("absolute mode fires when the value meets the float threshold", async () => {
    const events = [minutesAgo(1), minutesAgo(2), minutesAgo(3)] // 3 in the 5-min window
    const met = await runThreshold(events, target({ kind: "count" }), { mode: "absolute", value: 2 })
    expect(met.value).toBe(3)
    expect(met.threshold).toBe(2)
    expect(met.isMet).toBe(true)
  })

  it("absolute mode does not fire below the threshold", async () => {
    const events = [minutesAgo(1), minutesAgo(2), minutesAgo(3)]
    const notMet = await runThreshold(events, target({ kind: "count" }), { mode: "absolute", value: 5 })
    expect(notMet.isMet).toBe(false)
  })

  it("supports below-threshold metric alerts", async () => {
    const events = [minutesAgo(1), minutesAgo(2), minutesAgo(3)]
    const met = await runThreshold(events, target({ kind: "count" }), { mode: "absolute", value: 5 }, "below")
    const notMet = await runThreshold(events, target({ kind: "count" }), { mode: "absolute", value: 2 }, "below")
    expect(met.isMet).toBe(true)
    expect(notMet.isMet).toBe(false)
  })

  it("multiplier normalizes the baseline for accumulating metrics but not intensive ones", async () => {
    // 2 events in the last 5 min; 12 in the last hour (baseline window). The 10 older
    // events sit strictly before the 5-min boundary (6 min ago onward).
    const events = [minutesAgo(1), minutesAgo(2), ...[6, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((m) => minutesAgo(m))]
    const baseline = { kind: "average" as const, lookback: { unit: "hours" as const, hours: 1 } }

    // count (accumulating): threshold = 1 × 12 × (5min / 60min) = 1 → value 2 ≥ 1 → fires.
    const countEval = await runThreshold(events, target({ kind: "count" }), { mode: "multiplier", factor: 1, baseline })
    expect(countEval.baselineValue).toBe(12)
    expect(countEval.threshold).toBeCloseTo(1)
    expect(countEval.isMet).toBe(true)

    // avg (intensive): threshold = 1 × 12 (no window scaling) → value 2 < 12 → does not fire.
    const avgEval = await runThreshold(events, target({ kind: "avg", field: "duration" }), {
      mode: "multiplier",
      factor: 1,
      baseline,
    })
    expect(avgEval.threshold).toBe(12)
    expect(avgEval.isMet).toBe(false)
  })
})

describe("evaluateMetricEscalatingAlert (metric.escalating)", () => {
  const run = (
    events: readonly Date[],
    t: MetricSeriesTarget,
    threshold: Parameters<typeof evaluateMetricEscalatingAlert>[0]["condition"]["threshold"],
  ) =>
    Effect.runPromise(
      evaluateMetricEscalatingAlert({
        organizationId,
        projectId,
        target: t,
        condition: { kind: "metric.escalating", metric: t.metric, threshold, window: { minutes: 10 } },
        now,
      }).pipe(
        Effect.provide(createFakeMetricSeriesReader(events).layer),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
      ),
    )

  it("tiles a 10-min window into 1-min buckets and scales an accumulating absolute threshold per bucket", async () => {
    const events = [minutesAgo(1), minutesAgo(4), minutesAgo(7)]
    const evalResult = await run(events, target({ kind: "count" }), { mode: "absolute", value: 10 })
    expect(evalResult.bucketMs).toBe(60 * 1000)
    expect(evalResult.bucketValues).toHaveLength(10)
    // count is accumulating: per-bucket = 10 × (1min / 10min) = 1.
    expect(evalResult.perBucketThreshold).toBeCloseTo(1)
  })

  it("uses an intensive absolute threshold per bucket as-is", async () => {
    const evalResult = await run([minutesAgo(1)], target({ kind: "p95", field: "duration" }), {
      mode: "absolute",
      value: 3,
    })
    expect(evalResult.perBucketThreshold).toBe(3)
  })
})
