import { describe, expect, it } from "vitest"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import {
  computeDurationBreakdown,
  computeSessionDurationBreakdown,
  type DurationCategory,
} from "./duration-composition.ts"

// Build a minimal span; only the fields the helpers read are meaningful.
function span(partial: {
  spanId: string
  parentSpanId?: string
  traceId?: string
  operation: string
  start: number
  end: number
}): SpanRecord {
  return {
    spanId: partial.spanId,
    parentSpanId: partial.parentSpanId ?? "",
    traceId: partial.traceId ?? "t",
    operation: partial.operation,
    startTime: new Date(partial.start).toISOString(),
    endTime: new Date(partial.end).toISOString(),
  } as unknown as SpanRecord
}

function ms(
  segments: ReturnType<typeof computeDurationBreakdown>["segments"],
): Partial<Record<DurationCategory, number>> {
  return Object.fromEntries(segments.map((s) => [s.category, s.ms]))
}

describe("computeDurationBreakdown", () => {
  it("returns empty for no spans", () => {
    expect(computeDurationBreakdown([])).toEqual({ segments: [], wallClockMs: 0 })
  })

  it("attributes a single leaf span entirely to its category with no idle", () => {
    const { segments, wallClockMs } = computeDurationBreakdown([
      span({ spanId: "a", operation: "chat", start: 0, end: 1000 }),
    ])
    expect(wallClockMs).toBe(1000)
    expect(ms(segments)).toEqual({ generation: 1000 })
  })

  it("counts the gap between serial spans as idle", () => {
    // chat [0,1000] → idle [1000,1500] → tool [1500,2000]
    const { segments, wallClockMs } = computeDurationBreakdown([
      span({ spanId: "a", operation: "chat", start: 0, end: 1000 }),
      span({ spanId: "b", operation: "execute_tool", start: 1500, end: 2000 }),
    ])
    expect(wallClockMs).toBe(2000)
    expect(ms(segments)).toEqual({ generation: 1000, tool: 500, idle: 500 })
  })

  it("does not double-count parallel siblings (priority resolves overlap)", () => {
    // Two leaves fully overlapping [0,1000]: generation wins over tool by priority.
    const { segments, wallClockMs } = computeDurationBreakdown([
      span({ spanId: "a", operation: "chat", start: 0, end: 1000 }),
      span({ spanId: "b", operation: "execute_tool", start: 0, end: 1000 }),
    ])
    expect(wallClockMs).toBe(1000)
    expect(ms(segments)).toEqual({ generation: 1000 })
  })

  it("excludes container (non-leaf) spans and surfaces uncovered time as idle", () => {
    // root [0,2000] contains one chat child [0,1000]; remaining [1000,2000] is idle.
    const { segments, wallClockMs } = computeDurationBreakdown([
      span({ spanId: "root", operation: "invoke_agent", start: 0, end: 2000 }),
      span({ spanId: "a", parentSpanId: "root", operation: "chat", start: 0, end: 1000 }),
    ])
    expect(wallClockMs).toBe(2000)
    expect(ms(segments)).toEqual({ generation: 1000, idle: 1000 })
  })

  it("segments always sum to wall-clock duration", () => {
    const { segments, wallClockMs } = computeDurationBreakdown([
      span({ spanId: "root", operation: "chain", start: 0, end: 5000 }),
      span({ spanId: "a", parentSpanId: "root", operation: "chat", start: 100, end: 1200 }),
      span({ spanId: "b", parentSpanId: "root", operation: "execute_tool", start: 1200, end: 1800 }),
      span({ spanId: "c", parentSpanId: "root", operation: "retrieval", start: 2500, end: 3000 }),
      span({ spanId: "d", parentSpanId: "root", operation: "embeddings", start: 3000, end: 3200 }),
    ])
    const sum = segments.reduce((acc, s) => acc + s.ms, 0)
    expect(sum).toBe(wallClockMs)
  })

  it("maps reranker to retrieval and unknown operations to other", () => {
    const { segments } = computeDurationBreakdown([
      span({ spanId: "a", operation: "reranker", start: 0, end: 500 }),
      span({ spanId: "b", operation: "guardrail", start: 500, end: 800 }),
    ])
    expect(ms(segments)).toEqual({ retrieval: 500, other: 300 })
  })
})

describe("computeSessionDurationBreakdown", () => {
  it("does NOT count the gap between traces as idle", () => {
    // Trace A: chat [0,1000]. Trace B: chat [5000,6000]. The [1000,5000] gap is
    // between turns and must not appear as idle.
    const { segments, wallClockMs } = computeSessionDurationBreakdown([
      span({ spanId: "a", traceId: "A", operation: "chat", start: 0, end: 1000 }),
      span({ spanId: "b", traceId: "B", operation: "chat", start: 5000, end: 6000 }),
    ])
    expect(wallClockMs).toBe(2000)
    expect(ms(segments)).toEqual({ generation: 2000 })
  })

  it("sums within-trace idle across traces but ignores between-trace gaps", () => {
    // Trace A: chat [0,1000] + tool [1500,2000] → 500ms within-trace idle.
    // Trace B: chat [10000,11000]. Big gap before B is NOT idle.
    const { segments, wallClockMs } = computeSessionDurationBreakdown([
      span({ spanId: "a1", traceId: "A", operation: "chat", start: 0, end: 1000 }),
      span({ spanId: "a2", traceId: "A", operation: "execute_tool", start: 1500, end: 2000 }),
      span({ spanId: "b1", traceId: "B", operation: "chat", start: 10000, end: 11000 }),
    ])
    expect(wallClockMs).toBe(3000)
    expect(ms(segments)).toEqual({ generation: 2000, tool: 500, idle: 500 })
  })

  it("returns empty for no spans", () => {
    expect(computeSessionDurationBreakdown([])).toEqual({ segments: [], wallClockMs: 0 })
  })
})
