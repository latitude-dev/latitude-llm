import { describe, expect, it } from "vitest"
import { type BuildResult, SpanBuilder, type SpanRecord } from "./span-builder.ts"
import type {
  OpenClawAgentContext,
  OpenClawBeforeToolCallEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
  OpenClawModelCallEndedEvent,
  OpenClawModelCallStartedEvent,
} from "./types.ts"

function ctx(overrides: Partial<OpenClawAgentContext> = {}): OpenClawAgentContext {
  return {
    runId: "run-1",
    sessionId: "s-1",
    sessionKey: "sk-1",
    agentId: "router-agent",
    workspaceDir: "/w",
    ...overrides,
  }
}

function llmInput(overrides: Partial<OpenClawLlmInputEvent> = {}): OpenClawLlmInputEvent {
  return {
    runId: "run-1",
    sessionId: "s-1",
    provider: "openai",
    model: "gpt-5",
    systemPrompt: "you are helpful",
    prompt: "hello",
    historyMessages: [{ role: "user", content: "prior" }],
    imagesCount: 0,
    ...overrides,
  }
}

function llmOutput(overrides: Partial<OpenClawLlmOutputEvent> = {}): OpenClawLlmOutputEvent {
  return {
    runId: "run-1",
    sessionId: "s-1",
    provider: "openai",
    model: "gpt-5",
    resolvedRef: "openai/gpt-5",
    assistantTexts: ["done"],
    lastAssistant: { role: "assistant", content: "done" },
    usage: { input: 10, output: 5, cacheRead: 1, cacheWrite: 0, total: 15 },
    ...overrides,
  }
}

function modelStart(overrides: Partial<OpenClawModelCallStartedEvent> = {}): OpenClawModelCallStartedEvent {
  return {
    runId: "run-1",
    callId: "call-A",
    sessionId: "s-1",
    sessionKey: "sk-1",
    provider: "openai",
    model: "gpt-5",
    api: "chat.completions",
    transport: "https",
    ...overrides,
  }
}

function modelEnd(overrides: Partial<OpenClawModelCallEndedEvent> = {}): OpenClawModelCallEndedEvent {
  return {
    ...modelStart(overrides),
    durationMs: 250,
    outcome: "completed",
    upstreamRequestIdHash: "abc123",
    timeToFirstByteMs: 50,
    requestPayloadBytes: 1024,
    responseStreamBytes: 2048,
    ...overrides,
  }
}

function findSpan(result: BuildResult | undefined, name: string): SpanRecord | undefined {
  return result?.spans.find((s) => s.name === name)
}

function findAllSpans(result: BuildResult | undefined, name: string): SpanRecord[] {
  return result?.spans.filter((s) => s.name === name) ?? []
}

describe("SpanBuilder.onAgentEnd", () => {
  it("opens an agent span on before_agent_start and closes on agent_end", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({ prompt: "hi" }, ctx())
    const result = b.onAgentEnd({ messages: [], success: true, durationMs: 100 }, ctx())

    expect(result?.runId).toBe("run-1")
    const agent = findSpan(result, "agent")
    expect(agent).toBeDefined()
    expect(agent?.parentSpanId).toBe("")
    expect(agent?.outcome).toBe("ok")
    expect(agent?.attrs["openclaw.run.success"]).toBe(true)
    expect(agent?.attrs["openclaw.duration_ms"]).toBe(100)
  })

  it("returns undefined when agent_end fires without a matching run", () => {
    const b = new SpanBuilder()
    const result = b.onAgentEnd({ messages: [], success: true }, ctx({ runId: "missing" }))
    expect(result).toBeUndefined()
  })

  it("propagates error outcome on failure", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    const result = b.onAgentEnd({ messages: [], success: false, error: "budget exceeded" }, ctx())
    const agent = findSpan(result, "agent")
    expect(agent?.outcome).toBe("error")
    expect(agent?.errorMessage).toBe("budget exceeded")
  })
})

describe("SpanBuilder model_call lifecycle", () => {
  it("emits one model_call span per started/ended pair", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onModelCallStarted(modelStart({ callId: "A" }), ctx())
    b.onModelCallEnded(modelEnd({ callId: "A" }), ctx())
    b.onModelCallStarted(modelStart({ callId: "B" }), ctx())
    b.onModelCallEnded(modelEnd({ callId: "B", outcome: "error", errorCategory: "rate_limited" }), ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const calls = findAllSpans(result, "model_call")
    expect(calls).toHaveLength(2)
    expect(calls[0]?.attrs["openclaw.call.id"]).toBe("A")
    expect(calls[0]?.outcome).toBe("ok")
    expect(calls[1]?.outcome).toBe("error")
    expect(calls[1]?.attrs["openclaw.error.category"]).toBe("rate_limited")
  })

  it("captures upstream request id hash and ttfb on model_call_ended", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onModelCallStarted(modelStart(), ctx())
    b.onModelCallEnded(modelEnd({ upstreamRequestIdHash: "hash-xyz", timeToFirstByteMs: 73 }), ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const call = findSpan(result, "model_call")
    expect(call?.attrs["openclaw.upstream.request_id_hash"]).toBe("hash-xyz")
    expect(call?.attrs["openclaw.ttfb_ms"]).toBe(73)
  })

  it("force-closes model_call spans that never see _ended (abandoned)", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onModelCallStarted(modelStart(), ctx())
    // No model_call_ended.
    const result = b.onAgentEnd({ messages: [], success: false, error: "crashed" }, ctx())

    const call = findSpan(result, "model_call")
    expect(call?.endMs).toBeDefined()
    expect(call?.outcome).toBe("error")
    expect(call?.attrs["openclaw.outcome"]).toBe("abandoned")
  })

  it("nests tool_call as a sibling of agent (NOT as child of model_call)", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onModelCallStarted(modelStart(), ctx())
    b.onModelCallEnded(modelEnd(), ctx())
    b.onBeforeToolCall({ toolName: "grep", params: { q: "x" }, runId: "run-1", toolCallId: "tc-1" }, ctx())
    b.onAfterToolCall(
      { toolName: "grep", params: { q: "x" }, runId: "run-1", toolCallId: "tc-1", result: "match" },
      ctx(),
    )
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const agent = findSpan(result, "agent")
    const tool = findSpan(result, "tool_call:grep")
    expect(tool?.parentSpanId).toBe(agent?.spanId)
    // Crucially NOT the model_call's spanId.
    const modelCall = findSpan(result, "model_call")
    expect(tool?.parentSpanId).not.toBe(modelCall?.spanId)
  })
})

describe("SpanBuilder llm_input/llm_output (data-only)", () => {
  it("does not emit a span from llm_input/llm_output", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onLlmInput(llmInput(), ctx())
    b.onLlmOutput(llmOutput(), ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    // Just the agent span — no llm_request span.
    expect(result?.spans.map((s) => s.name)).toEqual(["agent"])
  })

  it("enriches the agent span with system instructions, output messages, usage", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onLlmInput(llmInput({ systemPrompt: "be helpful", prompt: "hi" }), ctx())
    b.onLlmOutput(llmOutput({ usage: { input: 100, output: 20, total: 120 } }), ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const agent = findSpan(result, "agent")
    expect(agent?.attrs["gen_ai.system_instructions:gated"]).toBe("be helpful")
    expect(agent?.attrs["user_prompt:gated"]).toBe("hi")
    expect(agent?.attrs["gen_ai.usage.input_tokens"]).toBe(100)
    expect(agent?.attrs["gen_ai.usage.output_tokens"]).toBe(20)
    expect(agent?.attrs["gen_ai.usage.total_tokens"]).toBe(120)
    expect(agent?.attrs["openclaw.resolved.ref"]).toBe("openai/gpt-5")
  })

  it("seeds the rolling history snapshot from llm_input", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onLlmInput(
      llmInput({
        historyMessages: [{ role: "user", content: "prior question" }],
        prompt: "current question",
      }),
      ctx(),
    )
    b.onModelCallStarted(modelStart({ callId: "first" }), ctx())
    b.onModelCallEnded(modelEnd({ callId: "first" }), ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const call = findSpan(result, "model_call")
    const messages = call?.attrs["gen_ai.input.messages:gated"] as unknown[] | undefined
    // history (1) + synthetic user prompt (1) at the time the call started.
    expect(messages).toHaveLength(2)
  })

  it("evolves history across tool calls so subsequent model_calls see post-tool state", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onLlmInput(llmInput({ historyMessages: [], prompt: "go" }), ctx())

    b.onModelCallStarted(modelStart({ callId: "A" }), ctx())
    b.onModelCallEnded(modelEnd({ callId: "A" }), ctx())
    b.onBeforeToolCall(
      { toolName: "search", params: { q: "x" }, runId: "run-1", toolCallId: "t-1" } as OpenClawBeforeToolCallEvent,
      ctx(),
    )
    b.onAfterToolCall(
      { toolName: "search", params: { q: "x" }, runId: "run-1", toolCallId: "t-1", result: "found 2" },
      ctx(),
    )
    b.onModelCallStarted(modelStart({ callId: "B" }), ctx())
    b.onModelCallEnded(modelEnd({ callId: "B" }), ctx())

    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const calls = findAllSpans(result, "model_call")
    const aMessages = calls[0]?.attrs["gen_ai.input.messages:gated"] as unknown[]
    const bMessages = calls[1]?.attrs["gen_ai.input.messages:gated"] as unknown[]
    // After tool execution, B should see the assistant tool_call + tool response added.
    expect(bMessages.length).toBeGreaterThan(aMessages.length)
    expect(bMessages.length - aMessages.length).toBe(2)
  })
})

describe("SpanBuilder subagent linkage", () => {
  it("nests a child agent run under the parent's subagent span", () => {
    const b = new SpanBuilder()

    // Parent run starts, spawns subagent.
    b.onBeforeAgentStart({}, ctx({ runId: "parent", agentId: "router" }))
    b.onSubagentSpawned(
      {
        runId: "child",
        childSessionKey: "sk-child",
        agentId: "code-agent",
        label: "code",
        mode: "session",
      },
      ctx({ runId: "parent", agentId: "router" }),
    )

    // Child run starts in its own session — should land under parent's subagent span.
    b.onBeforeAgentStart({}, ctx({ runId: "child", sessionKey: "sk-child", agentId: "code-agent" }))
    b.onModelCallStarted(modelStart({ runId: "child", callId: "child-A" }), ctx({ runId: "child" }))
    b.onModelCallEnded(modelEnd({ runId: "child", callId: "child-A" }), ctx({ runId: "child" }))
    const childResult = b.onAgentEnd({ messages: [], success: true }, ctx({ runId: "child", agentId: "code-agent" }))

    // Then subagent_ended on the parent.
    b.onSubagentEnded(
      { runId: "child", outcome: "completed", reason: "done" },
      ctx({ runId: "parent", agentId: "router" }),
    )
    const parentResult = b.onAgentEnd({ messages: [], success: true }, ctx({ runId: "parent", agentId: "router" }))

    const childAgent = findSpan(childResult, "agent")
    const parentAgent = findSpan(parentResult, "agent")
    const subagent = findSpan(parentResult, "subagent")

    expect(childAgent?.traceId).toBe(parentAgent?.traceId)
    expect(childAgent?.parentSpanId).toBe(subagent?.spanId)
    expect(subagent?.attrs["openclaw.subagent.outcome"]).toBe("completed")
    expect(subagent?.outcome).toBe("ok")
  })

  it("marks subagent error outcome correctly", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx({ runId: "parent" }))
    b.onSubagentSpawned(
      { runId: "child", childSessionKey: "sk-child", agentId: "child-agent" },
      ctx({ runId: "parent" }),
    )
    b.onSubagentEnded({ runId: "child", outcome: "error", error: "child crashed" }, ctx({ runId: "parent" }))
    const result = b.onAgentEnd({ messages: [], success: true }, ctx({ runId: "parent" }))

    const subagent = findSpan(result, "subagent")
    expect(subagent?.outcome).toBe("error")
    expect(subagent?.errorMessage).toBe("child crashed")
  })
})

describe("SpanBuilder compaction lifecycle", () => {
  it("emits a compaction span between model calls", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onBeforeCompaction({ messageCount: 50, sessionFile: "/tmp/x" }, ctx())
    b.onAfterCompaction({ messageCount: 12, compactedCount: 38, tokenCount: 4000 }, ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const compaction = findSpan(result, "compaction")
    expect(compaction).toBeDefined()
    expect(compaction?.outcome).toBe("ok")
    expect(compaction?.attrs["openclaw.compaction.message_count.before"]).toBe(50)
    expect(compaction?.attrs["openclaw.compaction.message_count.after"]).toBe(12)
    expect(compaction?.attrs["openclaw.compaction.compacted_count"]).toBe(38)
  })
})

describe("SpanBuilder tool_call lifecycle", () => {
  it("captures params + result on the tool_call span", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onBeforeToolCall({ toolName: "read_file", params: { path: "/x" }, runId: "run-1", toolCallId: "tc-1" }, ctx())
    b.onAfterToolCall(
      {
        toolName: "read_file",
        params: { path: "/x" },
        runId: "run-1",
        toolCallId: "tc-1",
        result: "data",
        durationMs: 5,
      },
      ctx(),
    )
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const tool = findSpan(result, "tool_call:read_file")
    expect(tool?.attrs["gen_ai.tool.call.arguments:gated"]).toEqual({ path: "/x" })
    expect(tool?.attrs["gen_ai.tool.call.result:gated"]).toBe("data")
    expect(tool?.attrs["openclaw.duration_ms"]).toBe(5)
    expect(tool?.outcome).toBe("ok")
  })

  it("marks tool errors with error.message and outcome", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onBeforeToolCall({ toolName: "crash", params: {}, runId: "run-1", toolCallId: "tc-x" }, ctx())
    b.onAfterToolCall({ toolName: "crash", params: {}, runId: "run-1", toolCallId: "tc-x", error: "boom" }, ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const tool = findSpan(result, "tool_call:crash")
    expect(tool?.outcome).toBe("error")
    expect(tool?.errorMessage).toBe("boom")
  })
})
