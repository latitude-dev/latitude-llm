import { describe, expect, it } from "vitest"
import type { SpanDetail } from "../../entities/span.ts"
import type { TransformContext } from "../transform.ts"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../types.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}
function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c"
const SESSION = "9f8b7a76-abd6-4855-9f39-e22ce23ed11e"
const USER_ID = "4ea2a748152ed22e21039407af95bbe77b563ab0ada3836ed3fd3879e8359304"

const context: TransformContext = {
  organizationId: "org-1",
  projectId: "proj-1",
  apiKeyId: "key-1",
  ingestedAt: new Date("2026-04-10T12:00:00.000Z"),
}

function runTransform(span: OtlpSpan): SpanDetail {
  const req: OtlpExportTraceServiceRequest = {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "claude-code" } }] },
        scopeSpans: [{ scope: { name: "claude-code", version: "1" }, spans: [span] }],
      },
    ],
  }
  const [out] = transformOtlpToSpans(req, context)
  return out
}

describe("Claude Code OTLP span expansion", () => {
  it("maps interaction spans: user_prompt → gen_ai.input.messages and operation", () => {
    const span: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "aaaaaaaaaaaaaaaa",
      parentSpanId: "",
      name: "interaction",
      kind: 1,
      startTimeUnixNano: "1710590400000000000",
      endTimeUnixNano: "1710590402008000000",
      attributes: [
        str("span.type", "interaction"),
        str("session.id", SESSION),
        str("user.id", USER_ID),
        str("user_prompt", "hi claudio"),
        int("user_prompt_length", 10),
        int("interaction.duration_ms", 2008),
      ],
      status: { code: 1 },
    }

    const d = runTransform(span)

    expect(d.sessionId).toBe(SESSION)
    expect(d.userId).toBe(USER_ID)
    expect(d.operation).toBe("prompt")
    expect(d.inputMessages).toHaveLength(1)
    expect(d.inputMessages[0]?.role).toBe("user")
    const parts = d.inputMessages[0]?.parts
    expect(parts?.[0]).toMatchObject({ type: "text", content: "hi claudio" })
  })

  it("maps llm_request spans: model, tokens, cache, TTFT, provider", () => {
    const span: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "bbbbbbbbbbbbbbbb",
      parentSpanId: "aaaaaaaaaaaaaaaa",
      name: "llm_request",
      kind: 3,
      startTimeUnixNano: "1710590402100000000",
      endTimeUnixNano: "1710590404091000000",
      attributes: [
        str("span.type", "llm_request"),
        str("session.id", SESSION),
        str("user.id", USER_ID),
        str("llm_request.context", "interaction"),
        str("model", "claude-opus-4-6\u001b[1m"),
        int("input_tokens", 3),
        int("output_tokens", 13),
        int("cache_read_tokens", 11_229),
        int("cache_creation_tokens", 4797),
        int("ttft_ms", 1953),
        int("attempt", 1),
        str("speed", "normal"),
        str("success", "true"),
      ],
      status: { code: 1 },
    }

    const d = runTransform(span)

    expect(d.sessionId).toBe(SESSION)
    expect(d.provider).toBe("anthropic")
    expect(d.model).toBe("claude-opus-4-6")
    expect(d.operation).toBe("chat")
    expect(d.tokensInput).toBe(3)
    expect(d.tokensOutput).toBe(13)
    expect(d.tokensCacheRead).toBe(11_229)
    expect(d.tokensCacheCreate).toBe(4797)
    expect(d.timeToFirstTokenNs).toBe(1_953_000_000)
    expect(d.isStreaming).toBe(true)
  })
})
