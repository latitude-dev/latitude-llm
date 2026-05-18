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

  it("maps tool_execution spans to execute_tool operation", () => {
    const span: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "cccccccccccccccc",
      parentSpanId: "bbbbbbbbbbbbbbbb",
      name: "tool:Bash",
      kind: 1,
      startTimeUnixNano: "1710590402100000000",
      endTimeUnixNano: "1710590402200000000",
      attributes: [
        str("span.type", "tool_execution"),
        str("session.id", SESSION),
        str("user.id", USER_ID),
        str("tool.name", "Bash"),
        str("tool.id", "toolu_01ABC"),
        str("tool.input", '{"command":"ls"}'),
        str("tool.output", "file1\nfile2"),
        str("success", "true"),
      ],
      status: { code: 1 },
    }

    const d = runTransform(span)

    expect(d.sessionId).toBe(SESSION)
    expect(d.operation).toBe("execute_tool")
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

  it("maps Agent SDK native span names (claude_code.*) when span.type is absent", () => {
    const interaction: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "1111111111111111",
      parentSpanId: "",
      name: "claude_code.interaction",
      kind: 1,
      startTimeUnixNano: "1710590400000000000",
      endTimeUnixNano: "1710590402008000000",
      attributes: [str("session.id", SESSION), str("user.id", USER_ID), str("user_prompt", "hello from agent sdk")],
      status: { code: 1 },
    }
    expect(runTransform(interaction).operation).toBe("prompt")

    const llm: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "2222222222222222",
      parentSpanId: "1111111111111111",
      name: "claude_code.llm_request",
      kind: 3,
      startTimeUnixNano: "1710590402100000000",
      endTimeUnixNano: "1710590404091000000",
      attributes: [
        str("session.id", SESSION),
        str("user.id", USER_ID),
        str("model", "claude-sonnet-4-20250514"),
        int("input_tokens", 5),
        int("output_tokens", 7),
        int("ttft_ms", 100),
      ],
      status: { code: 1 },
    }
    const llmDetail = runTransform(llm)
    expect(llmDetail.operation).toBe("chat")
    expect(llmDetail.provider).toBe("anthropic")
    expect(llmDetail.model).toBe("claude-sonnet-4-20250514")

    const tool: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "3333333333333333",
      parentSpanId: "1111111111111111",
      name: "claude_code.tool",
      kind: 1,
      startTimeUnixNano: "1710590404100000000",
      endTimeUnixNano: "1710590404200000000",
      attributes: [
        str("session.id", SESSION),
        str("user.id", USER_ID),
        str("tool.name", "Read"),
        str("tool.input", "{}"),
        str("tool.output", "ok"),
      ],
      status: { code: 1 },
    }
    expect(runTransform(tool).operation).toBe("execute_tool")

    const toolChild: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "4444444444444444",
      parentSpanId: "3333333333333333",
      name: "claude_code.tool.execution",
      kind: 1,
      startTimeUnixNano: "1710590404110000000",
      endTimeUnixNano: "1710590404190000000",
      attributes: [str("session.id", SESSION)],
      status: { code: 1 },
    }
    expect(runTransform(toolChild).operation).toBe("execute_tool")
  })

  it("maps span.type tool to execute_tool (native OTEL)", () => {
    const span: OtlpSpan = {
      traceId: TRACE_ID,
      spanId: "5555555555555555",
      parentSpanId: "",
      name: "claude_code.tool",
      kind: 1,
      startTimeUnixNano: "1710590400000000000",
      endTimeUnixNano: "1710590401000000000",
      attributes: [str("span.type", "tool"), str("session.id", SESSION), str("tool.name", "Glob")],
      status: { code: 1 },
    }
    expect(runTransform(span).operation).toBe("execute_tool")
  })
})
