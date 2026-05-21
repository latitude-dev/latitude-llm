import { describe, expect, it } from "vitest"
import { buildOtlpRequest } from "./otlp.ts"
import type { BuildResult, OtlpKeyValue, UserIdentity } from "./types.ts"

const identity: UserIdentity = {
  userId: "owner@example.com",
  email: "owner@example.com",
  userName: "owner",
  fullName: "Owner",
  hostName: "host",
}

function attrMap(attrs: OtlpKeyValue[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const attr of attrs) {
    if (attr.value.stringValue !== undefined) out[attr.key] = attr.value.stringValue
    else if (attr.value.intValue !== undefined) out[attr.key] = attr.value.intValue
    else if (attr.value.boolValue !== undefined) out[attr.key] = String(attr.value.boolValue)
    else if (attr.value.doubleValue !== undefined) out[attr.key] = String(attr.value.doubleValue)
  }
  return out
}

function result(): BuildResult {
  return {
    traceId: "a".repeat(32),
    spans: [
      {
        traceId: "a".repeat(32),
        spanId: "1".repeat(16),
        parentSpanId: "",
        name: "llm_request",
        startMs: 1_000,
        endMs: 1_100,
        outcome: "ok",
        attrs: {
          "span.type": "llm_request",
          "gen_ai.operation.name": "chat",
          "gen_ai.input.messages:gated": [{ role: "user", parts: [{ type: "text", content: "hello" }] }],
          "gen_ai.output.messages:gated": [{ role: "assistant", parts: [{ type: "text", content: "hi" }] }],
          "gen_ai.response.finish_reasons": ["stop"],
          "latitude.tags": ["pi"],
          "latitude.metadata": { "pi.cwd": "/repo" },
        },
      },
    ],
  }
}

describe("buildOtlpRequest", () => {
  it("encodes gated GenAI content as JSON strings when content capture is enabled", () => {
    const req = buildOtlpRequest(result(), { allowConversationAccess: true, identity })
    const span = req.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    const attrs = attrMap(span?.attributes ?? [])

    expect(attrs["span.type"]).toBe("llm_request")
    expect(attrs["gen_ai.operation.name"]).toBe("chat")
    expect(JSON.parse(attrs["gen_ai.input.messages"] ?? "[]")).toEqual([
      { role: "user", parts: [{ type: "text", content: "hello" }] },
    ])
    expect(JSON.parse(attrs["gen_ai.output.messages"] ?? "[]")).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "hi" }] },
    ])
    expect(attrs["gen_ai.input.messages:gated"]).toBeUndefined()
    expect(attrs["latitude.captured.content"]).toBe("true")
  })

  it("scrubs gated attributes when content capture is disabled", () => {
    const req = buildOtlpRequest(result(), { allowConversationAccess: false, identity })
    const span = req.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    const attrs = attrMap(span?.attributes ?? [])

    expect(attrs["span.type"]).toBe("llm_request")
    expect(attrs["gen_ai.operation.name"]).toBe("chat")
    expect(attrs["gen_ai.input.messages"]).toBeUndefined()
    expect(attrs["gen_ai.output.messages"]).toBeUndefined()
    expect(attrs["latitude.captured.content"]).toBe("false")
  })

  it("encodes latitude tags and metadata as JSON string attributes", () => {
    const req = buildOtlpRequest(result(), { allowConversationAccess: true, identity })
    const span = req.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    const attrs = attrMap(span?.attributes ?? [])

    expect(attrs["latitude.tags"]).toBe('["pi"]')
    expect(attrs["latitude.metadata"]).toBe('{"pi.cwd":"/repo"}')
  })

  it("encodes GenAI finish reasons as OTLP string arrays for Latitude's resolver", () => {
    const req = buildOtlpRequest(result(), { allowConversationAccess: true, identity })
    const span = req.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    const finishReasons = span?.attributes.find((attr) => attr.key === "gen_ai.response.finish_reasons")

    expect(finishReasons?.value.arrayValue?.values).toEqual([{ stringValue: "stop" }])
    expect(finishReasons?.value.stringValue).toBeUndefined()
  })
})
