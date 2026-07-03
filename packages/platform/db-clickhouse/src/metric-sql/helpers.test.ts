import type { MonitorMetric } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { type TraceFamilyColumns, traceFamilyAggregate } from "./helpers.ts"

const COLS: TraceFamilyColumns = {
  count: "count()",
  isError: "is_error",
  duration: "duration_ns",
  cost: "cost_total",
  tokens: "tokens",
  inputTokens: "tokens_input",
  cacheRead: "cache_read",
  cacheCreate: "cache_create",
}

describe("traceFamilyAggregate percentile", () => {
  it("maps median to the p50 quantile level", () => {
    expect(traceFamilyAggregate({ kind: "median", field: "duration" }, COLS)).toContain(
      "quantileTDigest(0.5)(duration_ns)",
    )
  })

  it("maps an arbitrary percentile `p` to level `p/100` over the chosen field", () => {
    const sql = (metric: MonitorMetric) => traceFamilyAggregate(metric, COLS)
    expect(sql({ kind: "percentile", field: "duration", p: 95 })).toContain("quantileTDigest(0.95)(duration_ns)")
    expect(sql({ kind: "percentile", field: "cost", p: 99 })).toContain("quantileTDigest(0.99)(cost_total)")
    expect(sql({ kind: "percentile", field: "duration", p: 10 })).toContain("quantileTDigest(0.1)(duration_ns)")
  })
})
