import { describe, expect, it } from "vitest"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import { toolCallSpanMapFromSpans } from "./timeline-adapters.ts"

function makeSpan(partial: Partial<SpanRecord> & Pick<SpanRecord, "spanId" | "toolCallId">): SpanRecord {
  return {
    organizationId: "org",
    projectId: "proj",
    traceId: "trace",
    parentSpanId: "",
    simulationId: "",
    name: "span",
    serviceName: "",
    kind: "internal",
    statusCode: "unset",
    statusMessage: "",
    operation: "execute_tool",
    provider: "",
    model: "",
    agentName: "",
    toolName: "",
    toolNames: [],
    tokensInput: 0,
    tokensOutput: 0,
    costTotalMicrocents: 0,
    timeToFirstTokenNs: 0,
    isStreaming: false,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:00:01.000Z",
    ingestedAt: "2026-01-01T00:00:01.000Z",
    ...partial,
  }
}

describe("toolCallSpanMapFromSpans", () => {
  it("maps toolCallId to spanId and skips empty ids", () => {
    const spans = [
      makeSpan({ spanId: "s1", toolCallId: "call-a" }),
      makeSpan({ spanId: "s2", toolCallId: "" }),
      makeSpan({ spanId: "s3", toolCallId: "call-b" }),
    ]
    expect(toolCallSpanMapFromSpans(spans)).toEqual({ "call-a": "s1", "call-b": "s3" })
  })

  it("returns an empty map for undefined spans", () => {
    expect(toolCallSpanMapFromSpans(undefined)).toEqual({})
  })
})
