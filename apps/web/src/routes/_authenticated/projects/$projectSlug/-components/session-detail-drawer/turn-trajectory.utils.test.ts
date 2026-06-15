import type { CohortMetric, CohortSummary, MetricBaseline } from "@domain/spans"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import { computeToolStatsByTrace, computeTurnHealth, inputPreview, outputPreview } from "./turn-trajectory.utils.ts"

function textMsg(role: string, ...texts: string[]): GenAIMessage {
  return { role, parts: texts.map((content) => ({ type: "text", content })) } as unknown as GenAIMessage
}

function toolMsg(role: string): GenAIMessage {
  return { role, parts: [{ type: "tool_call", id: "t", name: "x", arguments: {} }] } as unknown as GenAIMessage
}

function span(partial: { traceId: string; operation: string; error?: boolean }): SpanRecord {
  return {
    traceId: partial.traceId,
    operation: partial.operation,
    statusCode: partial.error ? "error" : "ok",
  } as unknown as SpanRecord
}

describe("computeToolStatsByTrace", () => {
  it("counts execute_tool spans and failures per trace", () => {
    const stats = computeToolStatsByTrace([
      span({ traceId: "A", operation: "execute_tool" }),
      span({ traceId: "A", operation: "execute_tool", error: true }),
      span({ traceId: "A", operation: "chat" }),
      span({ traceId: "B", operation: "execute_tool" }),
    ])
    expect(stats.get("A")).toEqual({ tools: 2, failed: 1 })
    expect(stats.get("B")).toEqual({ tools: 1, failed: 0 })
  })

  it("omits traces with no tool calls", () => {
    const stats = computeToolStatsByTrace([span({ traceId: "A", operation: "chat" })])
    expect(stats.has("A")).toBe(false)
  })
})

describe("inputPreview", () => {
  it("returns the last user message text", () => {
    expect(inputPreview([textMsg("user", "first"), textMsg("assistant", "reply"), textMsg("user", "second")])).toBe(
      "second",
    )
  })

  it("falls back to the last message with text when there is no user message", () => {
    expect(inputPreview([textMsg("system", "sys"), textMsg("assistant", "answer")])).toBe("answer")
  })

  it("collapses whitespace and returns empty for no text", () => {
    expect(inputPreview([textMsg("user", "  hello\n\n  world  ")])).toBe("hello world")
    expect(inputPreview([toolMsg("user")])).toBe("")
    expect(inputPreview([])).toBe("")
  })
})

describe("outputPreview", () => {
  it("returns the first assistant message with text, skipping tool-only messages", () => {
    expect(outputPreview([textMsg("user", "q"), toolMsg("assistant"), textMsg("assistant", "final")])).toBe("final")
  })

  it("falls back to the first message with text when there is no assistant message", () => {
    expect(outputPreview([textMsg("user", "only user")])).toBe("only user")
  })

  it("truncates long previews", () => {
    const long = "a".repeat(500)
    const result = outputPreview([textMsg("assistant", long)])
    expect(result.endsWith("…")).toBe(true)
    expect(result.length).toBe(161)
  })
})

function baseline(metric: CohortMetric, over: Partial<MetricBaseline> = {}): MetricBaseline {
  return { metric, sampleCount: 2000, p50: 100, p90: 200, p95: 300, p99: 400, ...over }
}

function cohorts(over: Partial<Record<CohortMetric, Partial<MetricBaseline>>> = {}): CohortSummary {
  return {
    count: 2000,
    baselines: {
      durationNs: baseline("durationNs", over.durationNs),
      costTotalMicrocents: baseline("costTotalMicrocents", over.costTotalMicrocents),
      tokensTotal: baseline("tokensTotal", over.tokensTotal),
      timeToFirstTokenNs: baseline("timeToFirstTokenNs", over.timeToFirstTokenNs),
    },
  }
}

describe("computeTurnHealth", () => {
  const ok = { errorCount: 0, durationNs: 150, costTotalMicrocents: 150 }

  it("flags errors as danger regardless of cohort", () => {
    expect(computeTurnHealth({ ...ok, errorCount: 2 }, undefined).tone).toBe("danger")
  })

  it("is neutral without a cohort and without errors", () => {
    expect(computeTurnHealth(ok, undefined)).toEqual({ tone: "none", reason: "" })
  })

  it("flags a top-1% duration outlier as danger", () => {
    expect(computeTurnHealth({ ...ok, durationNs: 500 }, cohorts())).toEqual({
      tone: "danger",
      reason: "Slow — top 1% of traces",
    })
  })

  it("flags a top-1% cost outlier as danger when duration is normal", () => {
    expect(computeTurnHealth({ ...ok, costTotalMicrocents: 500 }, cohorts()).reason).toBe(
      "Expensive — top 1% of traces",
    )
  })

  it("flags a top-5% duration outlier as warning", () => {
    expect(computeTurnHealth({ ...ok, durationNs: 350 }, cohorts())).toEqual({
      tone: "warning",
      reason: "Slow — top 5% of traces",
    })
  })

  it("stays neutral below p95 and when percentiles are gated to null", () => {
    expect(computeTurnHealth({ ...ok, durationNs: 250 }, cohorts()).tone).toBe("none")
    const gated = cohorts({ durationNs: { p95: null, p99: null } })
    expect(computeTurnHealth({ ...ok, durationNs: 9999 }, gated).tone).toBe("none")
  })
})
