import { describe, expect, it } from "vitest"
import type { SpanRecord } from "../../../../../../../../domains/spans/spans.functions.ts"
import {
  collectSpanModels,
  countMatchingSpans,
  filterSpansWithAncestors,
  hasActiveSpanFilters,
} from "./span-filters.ts"

function makeSpan(partial: Partial<SpanRecord> & Pick<SpanRecord, "spanId">): SpanRecord {
  return {
    organizationId: "org",
    projectId: "proj",
    traceId: "trace",
    parentSpanId: "",
    simulationId: "",
    name: partial.spanId,
    serviceName: "svc",
    kind: "internal",
    statusCode: "ok",
    statusMessage: "",
    operation: "chat",
    provider: "anthropic",
    model: "",
    tokensInput: 0,
    tokensOutput: 0,
    costTotalMicrocents: 0,
    timeToFirstTokenNs: 0,
    isStreaming: false,
    startTime: "2024-01-01T00:00:00Z",
    endTime: "2024-01-01T00:00:01Z",
    ingestedAt: "2024-01-01T00:00:01Z",
    ...partial,
  }
}

describe("span filters", () => {
  it("returns all spans when no filters are active", () => {
    const spans = [makeSpan({ spanId: "a" }), makeSpan({ spanId: "b" })]
    expect(hasActiveSpanFilters({ errors: false, tools: false, model: "" })).toBe(false)
    expect(filterSpansWithAncestors(spans, { errors: false, tools: false, model: "" })).toEqual(spans)
  })

  it("filters by model and keeps ancestors", () => {
    const spans = [
      makeSpan({ spanId: "root", parentSpanId: "" }),
      makeSpan({ spanId: "child", parentSpanId: "root", model: "claude-opus-4-8" }),
      makeSpan({ spanId: "other", parentSpanId: "root", model: "claude-fable-5" }),
    ]

    const filtered = filterSpansWithAncestors(spans, { errors: false, tools: false, model: "claude-opus-4-8" })
    expect(filtered.map((span) => span.spanId)).toEqual(["root", "child"])
    expect(countMatchingSpans(spans, { errors: false, tools: false, model: "claude-opus-4-8" })).toBe(1)
  })

  it("filters by errors and tools together", () => {
    const spans = [
      makeSpan({ spanId: "tool-ok", operation: "execute_tool", statusCode: "ok" }),
      makeSpan({ spanId: "tool-err", operation: "execute_tool", statusCode: "error" }),
      makeSpan({ spanId: "chat-err", operation: "chat", statusCode: "error" }),
    ]

    const filtered = filterSpansWithAncestors(spans, { errors: true, tools: true, model: "" })
    expect(filtered.map((span) => span.spanId)).toEqual(["tool-err"])
  })

  it("collects unique sorted models", () => {
    const spans = [
      makeSpan({ spanId: "a", model: "claude-opus-4-8" }),
      makeSpan({ spanId: "b", model: "claude-fable-5" }),
      makeSpan({ spanId: "c", model: "claude-opus-4-8" }),
    ]

    expect(collectSpanModels(spans)).toEqual(["claude-fable-5", "claude-opus-4-8"])
  })
})
