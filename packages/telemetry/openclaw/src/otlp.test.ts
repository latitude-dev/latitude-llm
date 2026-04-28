import { describe, expect, it } from "vitest"
import { buildOtlpRequest } from "./otlp.ts"
import type { BuildResult, SpanRecord } from "./span-builder.ts"
import type { OtlpKeyValue } from "./types.ts"

function attrMap(attrs: OtlpKeyValue[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key, value } of attrs) {
    if (value.stringValue !== undefined) out[key] = value.stringValue
    else if (value.intValue !== undefined) out[key] = value.intValue
    else if (value.boolValue !== undefined) out[key] = String(value.boolValue)
    else if (value.doubleValue !== undefined) out[key] = String(value.doubleValue)
  }
  return out
}

function findSpanByName(req: ReturnType<typeof buildOtlpRequest>, name: string) {
  return req.resourceSpans[0]?.scopeSpans[0]?.spans.find((s) => s.name === name)
}

function makeAgentResult(): BuildResult {
  const traceId = "a".repeat(32)
  const agentSpanId = "1".repeat(16)
  const callSpanId = "2".repeat(16)
  const toolSpanId = "3".repeat(16)
  const agent: SpanRecord = {
    spanId: agentSpanId,
    traceId,
    parentSpanId: "",
    name: "agent",
    startMs: 1_000,
    endMs: 1_500,
    outcome: "ok",
    attrs: {
      "openclaw.run.id": "run-1",
      "openclaw.agent.id": "router",
      "openclaw.agent.name": "router",
      "openclaw.run.success": true,
      "openclaw.duration_ms": 500,
      "gen_ai.system_instructions:gated": "be helpful",
      "user_prompt:gated": "hello",
      "gen_ai.input.messages:gated": [{ role: "user", content: "hello" }],
      "gen_ai.output.messages:gated": [{ role: "assistant", content: "hi" }],
      "gen_ai.usage.input_tokens": 10,
      "gen_ai.usage.output_tokens": 5,
      "gen_ai.usage.total_tokens": 15,
      "agent_end.messages:gated": [{ role: "user", content: "hello" }],
    },
  }
  const modelCall: SpanRecord = {
    spanId: callSpanId,
    traceId,
    parentSpanId: agentSpanId,
    name: "model_call",
    startMs: 1_100,
    endMs: 1_400,
    outcome: "ok",
    attrs: {
      "openclaw.run.id": "run-1",
      "openclaw.call.id": "call-A",
      "gen_ai.request.model": "gpt-5",
      "openclaw.duration_ms": 300,
      "openclaw.outcome": "completed",
      "gen_ai.input.messages:gated": [{ role: "user", content: "hello" }],
    },
  }
  const tool: SpanRecord = {
    spanId: toolSpanId,
    traceId,
    parentSpanId: agentSpanId,
    name: "tool_call:grep",
    startMs: 1_200,
    endMs: 1_250,
    outcome: "ok",
    attrs: {
      "openclaw.run.id": "run-1",
      "gen_ai.tool.name": "grep",
      "gen_ai.tool.call.id": "tc-1",
      "gen_ai.tool.call.arguments:gated": { q: "x" },
      "gen_ai.tool.call.result:gated": "match",
      "openclaw.duration_ms": 50,
    },
  }
  return { runId: "run-1", spans: [agent, modelCall, tool] }
}

describe("buildOtlpRequest", () => {
  it("emits the agent + model_call + tool_call tree with correct parent-child links", () => {
    const req = buildOtlpRequest(makeAgentResult(), { allowConversationAccess: true })
    const spans = req.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
    expect(spans).toHaveLength(3)
    const agent = spans.find((s) => s.name === "agent")
    const modelCall = spans.find((s) => s.name === "model_call")
    const tool = spans.find((s) => s.name === "tool_call:grep")
    expect(agent?.parentSpanId).toBe("")
    // Both model_call AND tool_call are children of agent (siblings).
    expect(modelCall?.parentSpanId).toBe(agent?.spanId)
    expect(tool?.parentSpanId).toBe(agent?.spanId)
  })

  it("strips :gated suffix from kept attribute keys when access is on", () => {
    const req = buildOtlpRequest(makeAgentResult(), { allowConversationAccess: true })
    const agent = findSpanByName(req, "agent")
    const attrs = attrMap(agent?.attributes ?? [])
    // `:gated` keys appear under their canonical name
    expect(attrs["gen_ai.system_instructions"]).toBe("be helpful")
    expect(attrs.user_prompt).toBe("hello")
    expect(attrs["gen_ai.input.messages"]).toBeDefined()
    expect(attrs["gen_ai.output.messages"]).toBeDefined()
    // …and NOT under the `:gated` form.
    expect(attrs["gen_ai.system_instructions:gated"]).toBeUndefined()
  })

  it("scrubs all :gated attributes when allowConversationAccess is false", () => {
    const req = buildOtlpRequest(makeAgentResult(), { allowConversationAccess: false })
    const agent = findSpanByName(req, "agent")
    const tool = findSpanByName(req, "tool_call:grep")
    const modelCall = findSpanByName(req, "model_call")
    const agentAttrs = attrMap(agent?.attributes ?? [])
    const toolAttrs = attrMap(tool?.attributes ?? [])
    const callAttrs = attrMap(modelCall?.attributes ?? [])

    // Content gone everywhere.
    expect(agentAttrs["gen_ai.system_instructions"]).toBeUndefined()
    expect(agentAttrs.user_prompt).toBeUndefined()
    expect(agentAttrs["gen_ai.input.messages"]).toBeUndefined()
    expect(agentAttrs["gen_ai.output.messages"]).toBeUndefined()
    expect(toolAttrs["gen_ai.tool.call.arguments"]).toBeUndefined()
    expect(toolAttrs["gen_ai.tool.call.result"]).toBeUndefined()
    expect(callAttrs["gen_ai.input.messages"]).toBeUndefined()

    // Structural attrs still present.
    expect(agentAttrs["openclaw.agent.id"]).toBe("router")
    expect(agentAttrs["openclaw.run.id"]).toBe("run-1")
    expect(agentAttrs["gen_ai.usage.input_tokens"]).toBe("10")
    expect(toolAttrs["gen_ai.tool.name"]).toBe("grep")
    expect(callAttrs["gen_ai.request.model"]).toBe("gpt-5")
  })

  it("emits latitude.captured.content on every span, mirroring the gate state", () => {
    const reqOn = buildOtlpRequest(makeAgentResult(), { allowConversationAccess: true })
    const reqOff = buildOtlpRequest(makeAgentResult(), { allowConversationAccess: false })
    for (const s of reqOn.resourceSpans[0]?.scopeSpans[0]?.spans ?? []) {
      expect(attrMap(s.attributes)["latitude.captured.content"]).toBe("true")
    }
    for (const s of reqOff.resourceSpans[0]?.scopeSpans[0]?.spans ?? []) {
      expect(attrMap(s.attributes)["latitude.captured.content"]).toBe("false")
    }
  })

  it("uses status code 1 for ok and 2 for error", () => {
    const result = makeAgentResult()
    const baseTool = result.spans[2]
    if (!baseTool) throw new Error("expected base tool span")
    const errSpan: SpanRecord = {
      ...baseTool,
      spanId: "f".repeat(16),
      name: "tool_call:fail",
      outcome: "error",
      errorMessage: "boom",
    }
    result.spans.push(errSpan)
    const req = buildOtlpRequest(result, { allowConversationAccess: true })
    const ok = findSpanByName(req, "tool_call:grep")
    const err = findSpanByName(req, "tool_call:fail")
    expect(ok?.status.code).toBe(1)
    expect(err?.status.code).toBe(2)
  })

  it("preserves traceId across all spans in the result", () => {
    const req = buildOtlpRequest(makeAgentResult(), { allowConversationAccess: true })
    const spans = req.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
    const traceIds = new Set(spans.map((s) => s.traceId))
    expect(traceIds.size).toBe(1)
  })
})
