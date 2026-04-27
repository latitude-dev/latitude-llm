import { describe, expect, it } from "vitest"
import { buildOtlpRequest } from "./otlp.ts"
import type { OtlpKeyValue, RunRecord } from "./types.ts"

function attrMap(attrs: OtlpKeyValue[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key, value } of attrs) {
    if (value.stringValue !== undefined) out[key] = value.stringValue
    else if (value.intValue !== undefined) out[key] = value.intValue
    else if (value.boolValue !== undefined) out[key] = String(value.boolValue)
  }
  return out
}

function sampleRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: "run-1",
    sessionId: "s-1",
    sessionKey: "sk-1",
    agentId: "router-agent",
    workspaceDir: "/w",
    messageProvider: "chat",
    trigger: "message",
    channelId: "ch-1",
    modelProviderId: "openai",
    modelId: "gpt-5",
    startMs: 1_000,
    endMs: 1_500,
    success: true,
    error: undefined,
    llmCalls: [
      {
        runId: "run-1",
        sessionId: "s-1",
        sessionKey: "sk-1",
        agentId: "router-agent",
        provider: "openai",
        requestModel: "gpt-5",
        responseModel: "gpt-5-2026-04-01",
        resolvedRef: "openai/gpt-5",
        systemPrompt: "you are helpful",
        prompt: "hello",
        historyMessages: [
          { role: "user", content: "prior question" },
          { role: "assistant", content: "prior answer" },
        ],
        imagesCount: 0,
        assistantTexts: ["hi"],
        lastAssistant: { role: "assistant", content: "hi" },
        usage: { input: 42, output: 7, cacheRead: 3, cacheWrite: 1, total: 49 },
        startMs: 1_100,
        endMs: 1_400,
        error: undefined,
        toolCalls: [
          {
            toolCallId: "tc-1",
            toolName: "read_file",
            params: { path: "/x" },
            result: { content: "data" },
            error: undefined,
            startMs: 1_200,
            endMs: 1_250,
            durationMs: 50,
            agentId: "router-agent",
          },
        ],
      },
    ],
    orphanTools: [],
    ...overrides,
  }
}

describe("buildOtlpRequest", () => {
  it("emits an interaction + llm_request + tool_execution span tree", () => {
    const req = buildOtlpRequest(sampleRun(), { allowConversationAccess: true })
    const spans = req.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
    expect(spans).toHaveLength(3)
    const [interaction, llm, tool] = spans

    expect(interaction?.name).toBe("interaction")
    expect(interaction?.parentSpanId).toBe("")
    expect(llm?.name).toBe("llm_request")
    expect(llm?.parentSpanId).toBe(interaction?.spanId)
    expect(tool?.name).toBe("tool:read_file")
    expect(tool?.parentSpanId).toBe(interaction?.spanId)
    expect(tool?.traceId).toBe(interaction?.traceId)
  })

  it("tags every span with the agent name", () => {
    const req = buildOtlpRequest(sampleRun(), { allowConversationAccess: true })
    const spans = req.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
    for (const s of spans) {
      const attrs = attrMap(s.attributes)
      expect(attrs["openclaw.agent.id"]).toBe("router-agent")
      expect(attrs["openclaw.agent.name"]).toBe("router-agent")
    }
  })

  it("captures everything on the llm_request span", () => {
    const req = buildOtlpRequest(sampleRun(), { allowConversationAccess: true })
    const llm = req.resourceSpans[0]?.scopeSpans[0]?.spans[1]
    const attrs = attrMap(llm?.attributes ?? [])

    expect(attrs.span_type ?? attrs["span.type"]).toBe("llm_request")
    expect(attrs["gen_ai.system"]).toBe("openai")
    expect(attrs["gen_ai.request.model"]).toBe("gpt-5")
    expect(attrs["gen_ai.response.model"]).toBe("gpt-5-2026-04-01")
    expect(attrs["openclaw.resolved.ref"]).toBe("openai/gpt-5")
    expect(attrs["gen_ai.usage.input_tokens"]).toBe("42")
    expect(attrs["gen_ai.usage.output_tokens"]).toBe("7")
    expect(attrs["gen_ai.usage.cache_read_input_tokens"]).toBe("3")
    expect(attrs["gen_ai.usage.cache_creation_input_tokens"]).toBe("1")
    expect(attrs["gen_ai.usage.total_tokens"]).toBe("49")
    expect(attrs["openclaw.session.key"]).toBe("sk-1")
    expect(attrs["openclaw.run.id"]).toBe("run-1")
    expect(attrs.llm_request_captured ?? attrs["llm_request.captured"]).toBe("true")

    const system = JSON.parse(attrs["gen_ai.system_instructions"] ?? "[]") as Array<{
      type: string
      content: string
    }>
    expect(system[0]?.content).toBe("you are helpful")

    const input = JSON.parse(attrs["gen_ai.input.messages"] ?? "[]") as Array<{
      role: string
      parts: Array<{ type: string; content?: string }>
    }>
    // History (2) + current user prompt (1).
    expect(input).toHaveLength(3)
    expect(input[2]?.role).toBe("user")
    expect(input[2]?.parts[0]?.content).toBe("hello")

    const output = JSON.parse(attrs["gen_ai.output.messages"] ?? "[]") as Array<{
      role: string
      parts: Array<{ type: string; content?: string; name?: string }>
    }>
    expect(output[0]?.role).toBe("assistant")
    // text part + tool_call part invoked during this call.
    expect(output[0]?.parts.some((p) => p.type === "text" && p.content === "hi")).toBe(true)
    expect(output[0]?.parts.some((p) => p.type === "tool_call" && p.name === "read_file")).toBe(true)
  })

  it("captures tool arguments and results on the tool span", () => {
    const req = buildOtlpRequest(sampleRun(), { allowConversationAccess: true })
    const tool = req.resourceSpans[0]?.scopeSpans[0]?.spans[2]
    const attrs = attrMap(tool?.attributes ?? [])
    expect(attrs["gen_ai.tool.name"]).toBe("read_file")
    expect(attrs["gen_ai.tool.call.id"]).toBe("tc-1")
    expect(JSON.parse(attrs["gen_ai.tool.call.arguments"] ?? "{}")).toEqual({ path: "/x" })
    expect(JSON.parse(attrs["gen_ai.tool.call.result"] ?? "{}")).toEqual({ content: "data" })
    expect(attrs.success).toBe("true")
    expect(attrs["tool.duration_ms"]).toBe("50")
  })

  it("aggregates token usage across multiple LLM calls on the interaction span", () => {
    const run = sampleRun()
    const firstCall = run.llmCalls[0]
    if (!firstCall) throw new Error("expected a first call")
    run.llmCalls.push({
      ...firstCall,
      usage: { input: 8, output: 2, total: 10 },
      toolCalls: [],
    })
    const req = buildOtlpRequest(run, { allowConversationAccess: true })
    const interaction = req.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    const attrs = attrMap(interaction?.attributes ?? [])
    expect(attrs["gen_ai.usage.input_tokens"]).toBe("50")
    expect(attrs["gen_ai.usage.output_tokens"]).toBe("9")
    expect(attrs["gen_ai.usage.total_tokens"]).toBe("59")
    expect(attrs["interaction.call_count"]).toBe("2")
  })

  it("marks tool error spans with status code 2", () => {
    const run = sampleRun()
    const tool = run.llmCalls[0]?.toolCalls[0]
    if (!tool) throw new Error("expected a tool call")
    tool.error = "boom"
    tool.result = undefined
    const req = buildOtlpRequest(run, { allowConversationAccess: true })
    const toolSpan = req.resourceSpans[0]?.scopeSpans[0]?.spans[2]
    expect(toolSpan?.status.code).toBe(2)
    const attrs = attrMap(toolSpan?.attributes ?? [])
    expect(attrs["error.message"]).toBe("boom")
    expect(attrs.success).toBe("false")
  })

  it("marks failed runs with interaction status code 2", () => {
    const run = sampleRun({ success: false, error: "run failed" })
    const req = buildOtlpRequest(run, { allowConversationAccess: true })
    const interaction = req.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    expect(interaction?.status.code).toBe(2)
    const attrs = attrMap(interaction?.attributes ?? [])
    expect(attrs["openclaw.run.error"]).toBe("run failed")
    expect(attrs["openclaw.run.success"]).toBe("false")
  })

  it("emits orphan tool spans parented on the interaction", () => {
    const run = sampleRun()
    run.orphanTools.push({
      toolCallId: "tc-orphan",
      toolName: "drift",
      params: { q: 1 },
      result: "ok",
      error: undefined,
      startMs: 1_000,
      endMs: 1_050,
      durationMs: 50,
      agentId: "router-agent",
    })
    const req = buildOtlpRequest(run, { allowConversationAccess: true })
    const spans = req.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
    const orphan = spans.find((s) => s.name === "tool:drift")
    expect(orphan).toBeDefined()
    expect(orphan?.parentSpanId).toBe(spans[0]?.spanId)
  })

  describe("when allowConversationAccess is false", () => {
    it("scrubs content attributes from llm_request spans", () => {
      const req = buildOtlpRequest(sampleRun(), { allowConversationAccess: false })
      const llm = req.resourceSpans[0]?.scopeSpans[0]?.spans[1]
      const attrs = attrMap(llm?.attributes ?? [])

      // Content gone.
      expect(attrs["gen_ai.system_instructions"]).toBeUndefined()
      expect(attrs["gen_ai.input.messages"]).toBeUndefined()
      expect(attrs["gen_ai.output.messages"]).toBeUndefined()

      // Structural / numeric attrs still present.
      expect(attrs["gen_ai.request.model"]).toBe("gpt-5")
      expect(attrs["gen_ai.usage.input_tokens"]).toBe("42")
      expect(attrs["gen_ai.usage.total_tokens"]).toBe("49")
      expect(attrs["openclaw.agent.id"]).toBe("router-agent")
      expect(attrs["openclaw.run.id"]).toBe("run-1")
      expect(attrs["latitude.captured.content"]).toBe("false")
    })

    it("scrubs tool args + result but keeps name/id/duration/error/agent", () => {
      const run = sampleRun()
      const tool = run.llmCalls[0]?.toolCalls[0]
      if (!tool) throw new Error("expected a tool call")
      tool.error = undefined
      const req = buildOtlpRequest(run, { allowConversationAccess: false })
      const toolSpan = req.resourceSpans[0]?.scopeSpans[0]?.spans[2]
      const attrs = attrMap(toolSpan?.attributes ?? [])

      // Content gone.
      expect(attrs["gen_ai.tool.call.arguments"]).toBeUndefined()
      expect(attrs["gen_ai.tool.call.result"]).toBeUndefined()

      // Structural still present.
      expect(attrs["gen_ai.tool.name"]).toBe("read_file")
      expect(attrs["gen_ai.tool.call.id"]).toBe("tc-1")
      expect(attrs["tool.duration_ms"]).toBe("50")
      expect(attrs["openclaw.agent.id"]).toBe("router-agent")
      expect(attrs["latitude.captured.content"]).toBe("false")
    })

    it("scrubs user_prompt from interaction span but keeps token/agent attrs", () => {
      const req = buildOtlpRequest(sampleRun(), { allowConversationAccess: false })
      const interaction = req.resourceSpans[0]?.scopeSpans[0]?.spans[0]
      const attrs = attrMap(interaction?.attributes ?? [])

      expect(attrs.user_prompt).toBeUndefined()
      expect(attrs["gen_ai.usage.total_tokens"]).toBe("49")
      expect(attrs["openclaw.agent.id"]).toBe("router-agent")
      expect(attrs["latitude.captured.content"]).toBe("false")
    })
  })
})
