import { describe, expect, it } from "vitest"
import { formatMetricValue, metricUnit, metricValueFromStored, metricValueToStored } from "./monitor-metric-units.ts"

describe("monitor-metric-units", () => {
  it("maps each metric to its display unit", () => {
    expect(metricUnit({ kind: "errorRate" })).toBe("%")
    expect(metricUnit({ kind: "count" })).toBe("count")
    expect(metricUnit({ kind: "avg", field: "duration" })).toBe("s")
    expect(metricUnit({ kind: "median", field: "cost" })).toBe("$")
    expect(metricUnit({ kind: "sum", field: "tokens" })).toBe("tokens")
  })

  it("converts display values to the stored unit the firing path compares", () => {
    expect(metricValueToStored(5, { kind: "errorRate" })).toBe(0.05)
    expect(metricValueToStored(0.5, { kind: "median", field: "duration" })).toBe(500_000_000)
    expect(metricValueToStored(10, { kind: "sum", field: "cost" })).toBe(1_000_000_000)
    expect(metricValueToStored(100, { kind: "count" })).toBe(100)
    expect(metricValueToStored(5000, { kind: "sum", field: "tokens" })).toBe(5000)
  })

  it("round-trips stored ↔ display without drift", () => {
    for (const metric of [
      { kind: "errorRate" } as const,
      { kind: "avg", field: "duration" } as const,
      { kind: "sum", field: "cost" } as const,
      { kind: "count" } as const,
    ]) {
      const stored = metricValueToStored(7.5, metric)
      expect(metricValueFromStored(stored, metric)).toBeCloseTo(7.5)
    }
  })

  it("formats a stored value with its unit", () => {
    expect(formatMetricValue(0.05, { kind: "errorRate" })).toBe("5%")
    expect(formatMetricValue(500_000_000, { kind: "median", field: "duration" })).toBe("0.5s")
    expect(formatMetricValue(1_000_000_000, { kind: "sum", field: "cost" })).toBe("$10")
    expect(formatMetricValue(5000, { kind: "sum", field: "tokens" })).toBe("5000 tokens")
    expect(formatMetricValue(100, { kind: "count" })).toBe("100")
  })
})
