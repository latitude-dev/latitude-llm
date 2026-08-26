import { describe, expect, it } from "vitest"
import { evaluationTimeAxis } from "./monitor.ts"

describe("evaluationTimeAxis", () => {
  it("waits for completion on match, whatever the metric", () => {
    expect(evaluationTimeAxis("match", { kind: "count" })).toBe("completion")
    expect(evaluationTimeAxis("match", { kind: "errorRate" })).toBe("completion")
  })

  it("measures counts by start, so a surge shows up as it arrives", () => {
    expect(evaluationTimeAxis("threshold", { kind: "count" })).toBe("start")
    expect(evaluationTimeAxis("escalating", { kind: "count" })).toBe("start")
  })

  it("waits for completion on every metric a run only settles at the end", () => {
    expect(evaluationTimeAxis("threshold", { kind: "errorRate" })).toBe("completion")
    expect(evaluationTimeAxis("threshold", { kind: "cacheHitRate" })).toBe("completion")
    expect(evaluationTimeAxis("threshold", { kind: "sum", field: "cost" })).toBe("completion")
    expect(evaluationTimeAxis("threshold", { kind: "avg", field: "duration" })).toBe("completion")
    expect(evaluationTimeAxis("threshold", { kind: "percentile", p: 95, field: "duration" })).toBe("completion")
  })
})
