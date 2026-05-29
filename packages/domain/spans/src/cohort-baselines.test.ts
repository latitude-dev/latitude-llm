import { describe, expect, it } from "vitest"
import {
  buildMetricBaselines,
  COHORT_P90_MIN_SAMPLES,
  type CohortBaselineData,
  getMetricPercentileThreshold,
  isMetricPercentileAvailable,
} from "./cohort-baselines.ts"

const baselineData: CohortBaselineData = {
  count: 1_000,
  metrics: {
    durationNs: { sampleCount: 1_000, p50: 100, p90: 200, p95: 300, p99: 400 },
    costTotalMicrocents: { sampleCount: 1_000, p50: 100, p90: 200, p95: 300, p99: 400 },
    tokensTotal: { sampleCount: 1_000, p50: 100, p90: 200, p95: 300, p99: 400 },
    timeToFirstTokenNs: { sampleCount: 1_000, p50: 50, p90: 100, p95: 150, p99: 200 },
  },
}

describe("cohort baselines", () => {
  it("hides p90 thresholds until the baseline has enough samples", () => {
    const insufficient = buildMetricBaselines({
      ...baselineData,
      metrics: {
        ...baselineData.metrics,
        durationNs: { sampleCount: COHORT_P90_MIN_SAMPLES - 1, p50: 100, p90: 200, p95: null, p99: null },
      },
    }).durationNs

    expect(isMetricPercentileAvailable(insufficient, "p90")).toBe(false)
    expect(getMetricPercentileThreshold(insufficient, "p90")).toBeNull()

    const sufficient = buildMetricBaselines({
      ...baselineData,
      metrics: {
        ...baselineData.metrics,
        durationNs: { sampleCount: COHORT_P90_MIN_SAMPLES, p50: 100, p90: 200, p95: null, p99: null },
      },
    }).durationNs

    expect(isMetricPercentileAvailable(sufficient, "p90")).toBe(true)
    expect(getMetricPercentileThreshold(sufficient, "p90")).toBe(200)
  })

  it("nulls p95 below 100 samples and p99 below 1000 samples regardless of raw input", () => {
    const baseline = buildMetricBaselines({
      ...baselineData,
      metrics: {
        ...baselineData.metrics,
        costTotalMicrocents: { sampleCount: 50, p50: 10, p90: 20, p95: 30, p99: 40 },
      },
    }).costTotalMicrocents

    expect(baseline.p95).toBeNull()
    expect(baseline.p99).toBeNull()
    expect(getMetricPercentileThreshold(baseline, "p95")).toBeNull()
    expect(getMetricPercentileThreshold(baseline, "p99")).toBeNull()
  })
})
