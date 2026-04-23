import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  buildTraceCohortSummaryEntries,
  buildTraceMetricBaselines,
  evaluateTraceResourceOutliers,
  getTraceMetricPercentileThreshold,
  isTraceCohortKeyAvailable,
  isTraceMetricPercentileAvailable,
  TRACE_COHORT_P90_MIN_SAMPLES,
  type Trace,
  type TraceCohortBaselineData,
} from "./index.ts"

function makeTrace(overrides?: Partial<Trace>): Trace {
  return {
    organizationId: OrganizationId("o".repeat(24)),
    projectId: ProjectId("p".repeat(24)),
    traceId: TraceId("t".repeat(32)),
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 100,
    timeToFirstTokenNs: 10,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 100,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 100,
    sessionId: SessionId("session"),
    userId: ExternalUserId("user"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    ...overrides,
  }
}

const baselineData: TraceCohortBaselineData = {
  traceCount: 1_000,
  metrics: {
    durationNs: { sampleCount: 1_000, p50: 100, p90: 200, p95: 300, p99: 400 },
    costTotalMicrocents: { sampleCount: 1_000, p50: 100, p90: 200, p95: 300, p99: 400 },
    tokensTotal: { sampleCount: 1_000, p50: 100, p90: 200, p95: 300, p99: 400 },
    timeToFirstTokenNs: { sampleCount: 1_000, p50: 50, p90: 100, p95: 150, p99: 200 },
  },
}

describe("trace cohorts", () => {
  it("builds available cohort entries with overlapping counts", () => {
    const baselines = buildTraceMetricBaselines(baselineData)
    const entries = buildTraceCohortSummaryEntries(baselines, {
      "latency-p95-plus": 10,
      "latency-p99-plus": 4,
    })

    expect(entries.find((entry) => entry.key === "latency-p95-plus")).toEqual({
      key: "latency-p95-plus",
      available: true,
      count: 10,
    })
    expect(entries.find((entry) => entry.key === "latency-p99-plus")).toEqual({
      key: "latency-p99-plus",
      available: true,
      count: 4,
    })
  })

  it("marks combined cohorts unavailable when matching baselines do not exist", () => {
    const baselines = buildTraceMetricBaselines({
      ...baselineData,
      metrics: {
        ...baselineData.metrics,
        costTotalMicrocents: { sampleCount: 20, p50: 10, p90: 20, p95: null, p99: null },
      },
    })

    const availability = isTraceCohortKeyAvailable("latency-and-cost-p95-plus", baselines)
    expect(availability.available).toBe(false)
    expect(availability.unavailableReason).toBe("mixed-mode-suppressed")
  })

  it("hides p90 thresholds until the baseline has enough samples", () => {
    const insufficientP90Baseline = buildTraceMetricBaselines({
      ...baselineData,
      metrics: {
        ...baselineData.metrics,
        durationNs: {
          sampleCount: TRACE_COHORT_P90_MIN_SAMPLES - 1,
          p50: 100,
          p90: 200,
          p95: null,
          p99: null,
        },
      },
    }).durationNs

    expect(isTraceMetricPercentileAvailable(insufficientP90Baseline, "p90")).toBe(false)
    expect(getTraceMetricPercentileThreshold(insufficientP90Baseline, "p90")).toBeNull()

    const sufficientP90Baseline = buildTraceMetricBaselines({
      ...baselineData,
      metrics: {
        ...baselineData.metrics,
        durationNs: {
          sampleCount: TRACE_COHORT_P90_MIN_SAMPLES,
          p50: 100,
          p90: 200,
          p95: null,
          p99: null,
        },
      },
    }).durationNs

    expect(isTraceMetricPercentileAvailable(sufficientP90Baseline, "p90")).toBe(true)
    expect(getTraceMetricPercentileThreshold(sufficientP90Baseline, "p90")).toBe(200)
  })

  it("matches p99 and combined cohort reasons for severe traces", () => {
    const baselines = buildTraceMetricBaselines(baselineData)
    const evaluation = evaluateTraceResourceOutliers(
      makeTrace({ durationNs: 450, costTotalMicrocents: 450, tokensTotal: 50, timeToFirstTokenNs: 0 }),
      baselines,
    )

    expect(evaluation.matched).toBe(true)
    expect(evaluation.reasons.map((reason) => reason.key)).toEqual([
      "latency-and-cost-p99-plus",
      "latency-p99-plus",
      "cost-p99-plus",
      "latency-and-cost-p95-plus",
      "latency-p95-plus",
      "cost-p95-plus",
    ])
  })
})
