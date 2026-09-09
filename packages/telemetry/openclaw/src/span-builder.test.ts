import { describe, expect, it } from "vitest"
import type { Message } from "./messages.ts"
import { type BuildResult, SpanBuilder, type SpanRecord } from "./span-builder.ts"
import type {
  OpenClawAgentContext,
  OpenClawAgentEndEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
  OpenClawModelCallEndedEvent,
  OpenClawModelCallStartedEvent,
} from "./types.ts"

interface Harness {
  builder: SpanBuilder
  emitted: BuildResult[]
  clock: { now: number }
  timers: Array<{ fn: () => void; ms: number; cancelled: boolean }>
  fireTimers: () => void
  files: Map<string, string>
}

function harness(overrides: Partial<ConstructorParameters<typeof SpanBuilder>[0]> = {}): Harness {
  const emitted: BuildResult[] = []
  const clock = { now: 1_000_000 }
  const timers: Harness["timers"] = []
  const files = new Map<string, string>()
  const builder = new SpanBuilder({
    emit: (r) => emitted.push(r),
    pluginVersion: "9.9.9",
    now: () => clock.now,
    schedule: (fn, ms) => {
      const entry = { fn, ms, cancelled: false }
      timers.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    readFile: (path) => files.get(path),
    ...overrides,
  })
  return {
    builder,
    emitted,
    clock,
    timers,
    files,
    fireTimers: () => {
      for (const t of timers.splice(0)) if (!t.cancelled) t.fn()
    },
  }
}

function ctx(overrides: Partial<OpenClawAgentContext> = {}): OpenClawAgentContext {
  return {
    runId: "run-1",
    sessionId: "sess-1",
    sessionKey: "agent:main:slack:channel:C1",
    agentId: "main",
    workspaceDir: "/ws",
    channel: "slack",
    channelId: "C1",
    trigger: "user",
    senderId: "U1",
    ...overrides,
  }
}

function llmInput(overrides: Partial<OpenClawLlmInputEvent> = {}): OpenClawLlmInputEvent {
  return {
    runId: "run-1",
    sessionId: "sess-1",
    provider: "openai",
    model: "gpt-5",
    systemPrompt: "you are helpful",
    prompt: "hello",
    historyMessages: [{ role: "user", content: "prior", timestamp: 1 }],
    imagesCount: 0,
    tools: [{ name: "exec", description: "run", parameters: { type: "object" }, execute: () => {} }],
    ...overrides,
  }
}

function llmOutput(overrides: Partial<OpenClawLlmOutputEvent> = {}): OpenClawLlmOutputEvent {
  return {
    runId: "run-1",
    sessionId: "sess-1",
    provider: "openai",
    model: "gpt-5",
    resolvedRef: "openai/gpt-5",
    assistantTexts: ["done"],
    usage: { input: 10, output: 5, cacheRead: 1, cacheWrite: 0, total: 16 },
    ...overrides,
  }
}

function modelStart(overrides: Partial<OpenClawModelCallStartedEvent> = {}): OpenClawModelCallStartedEvent {
  return { runId: "run-1", callId: "call-A", provider: "openai", model: "gpt-5", api: "responses", ...overrides }
}

function modelEnd(overrides: Partial<OpenClawModelCallEndedEvent> = {}): OpenClawModelCallEndedEvent {
  return { ...modelStart(), durationMs: 100, outcome: "completed", timeToFirstByteMs: 40, ...overrides }
}

function assistant(text: string, timestamp: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    provider: "openai",
    model: "gpt-5",
    stopReason: "stop",
    timestamp,
    usage: {
      input: 100,
      output: 20,
      cacheRead: 30,
      cacheWrite: 0,
      totalTokens: 150,
      reasoningTokens: 5,
      cost: { input: 0.001, output: 0.002, cacheRead: 0.0001, cacheWrite: 0, total: 0.0031 },
    },
    ...extra,
  }
}

function agentEnd(overrides: Partial<OpenClawAgentEndEvent> = {}): OpenClawAgentEndEvent {
  return { messages: [], success: true, durationMs: 500, ...overrides }
}

function byName(result: BuildResult, name: string): SpanRecord[] {
  return result.spans.filter((s) => s.name === name)
}

function root(result: BuildResult): SpanRecord {
  const span = result.spans.find((s) => s.name === "interaction")
  if (!span) throw new Error("no interaction span")
  return span
}

describe("run lifecycle", () => {
  it("opens the root lazily on llm_input and ships after agent_end + llm_output", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    expect(h.builder.inflightCount()).toBe(1)
    h.builder.onAgentEnd(agentEnd(), ctx())
    expect(h.emitted).toHaveLength(0)
    h.builder.onLlmOutput(llmOutput(), ctx())
    expect(h.emitted).toHaveLength(1)
    expect(h.timers[0]?.cancelled).toBe(true)
    const r = root(h.emitted[0] as BuildResult)
    expect(r.attrs["gen_ai.operation.name"]).toBe("invoke_agent")
    expect(r.attrs["openclaw.run.success"]).toBe(true)
    expect(r.outcome).toBe("ok")
    expect(r.parentSpanId).toBe("")
    expect(h.builder.inflightCount()).toBe(0)
  })

  it("finalizes on the grace timer when llm_output never arrives", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onAgentEnd(agentEnd({ success: false, error: "boom" }), ctx())
    expect(h.emitted).toHaveLength(0)
    h.fireTimers()
    expect(h.emitted).toHaveLength(1)
    const r = root(h.emitted[0] as BuildResult)
    expect(r.outcome).toBe("error")
    expect(r.attrs["error.message:gated"]).toBe("boom")
  })

  it("accepts llm_output before agent_end (cli-runner order)", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    expect(h.emitted).toHaveLength(0)
    h.builder.onAgentEnd(agentEnd(), ctx())
    expect(h.emitted).toHaveLength(1)
    expect(h.timers).toHaveLength(0)
  })

  it("backdates the root start from agent_end.durationMs", () => {
    const h = harness()
    h.clock.now = 5_000
    h.builder.onLlmInput(llmInput(), ctx())
    h.clock.now = 5_400
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd({ durationMs: 900 }), ctx())
    const r = root(h.emitted[0] as BuildResult)
    expect(r.startMs).toBe(4_500)
    expect(r.endMs).toBe(5_400)
  })

  it("carries prompt, input messages, system instructions and output on the root", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd({ messages: [assistant("final answer", h.clock.now)] }), ctx())
    const r = root(h.emitted[0] as BuildResult)
    expect(r.attrs["user_prompt:gated"]).toBe("hello")
    expect(r.attrs["gen_ai.input.messages:gated"]).toEqual([
      { role: "user", parts: [{ type: "text", content: "prior" }] },
      { role: "user", parts: [{ type: "text", content: "hello" }] },
    ])
    expect(r.attrs["gen_ai.system_instructions:gated"]).toEqual([{ type: "text", content: "you are helpful" }])
    expect(r.attrs["gen_ai.output.messages:gated"]).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "final answer" }] },
    ])
  })

  it("stamps session, user, agent, tags and metadata on every span", () => {
    const h = harness({ tags: ["prod"], metadata: { deployment: "eu", "openclaw.run.id": "forged" } })
    h.builder.onMessageReceived(
      {
        senderId: "U1",
        sessionKey: "agent:main:slack:channel:C1",
        metadata: { senderName: "Alex", senderUsername: "alex" },
      },
      {},
    )
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onModelCallEnded(modelEnd(), { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    for (const span of (h.emitted[0] as BuildResult).spans) {
      expect(span.attrs["session.id"]).toBe("sess-1")
      expect(span.attrs["gen_ai.session.id"]).toBe("sess-1")
      expect(span.attrs["user.id"]).toBe("U1")
      expect(span.attrs["gen_ai.agent.name"]).toBe("main")
      expect(span.attrs["latitude.tags"]).toEqual(["openclaw", "slack", "main", "prod"])
      const metadata = span.attrs["latitude.metadata"] as Record<string, string>
      expect(metadata.deployment).toBe("eu")
      expect(metadata["openclaw.run.id"]).toBe("run-1")
      expect(metadata["openclaw.sender.name"]).toBe("Alex")
      expect(metadata["openclaw.sender.username"]).toBe("alex")
      expect(metadata["openclaw.plugin.version"]).toBe("9.9.9")
    }
  })

  it("omits user.id when the run has no sender (non-user trigger)", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx({ senderId: undefined, trigger: "heartbeat" }))
    h.builder.onLlmOutput(llmOutput(), ctx({ senderId: undefined, trigger: "heartbeat" }))
    h.builder.onAgentEnd(agentEnd(), ctx({ senderId: undefined, trigger: "heartbeat" }))
    const r = root(h.emitted[0] as BuildResult)
    expect(r.attrs["user.id"]).toBeUndefined()
    expect(r.attrs["latitude.tags"]).toEqual(["openclaw", "slack", "main", "heartbeat"])
    expect(r.attrs["interaction.kind"]).toBe("heartbeat")
  })
})

describe("llm_request spans", () => {
  it("emits one chat span per model call with per-call usage, cost and output from the transcript", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.clock.now = 1_000_100
    h.builder.onModelCallStarted(modelStart({ callId: "call-A" }), { runId: "run-1" })
    h.clock.now = 1_000_200
    h.builder.onModelCallEnded(modelEnd({ callId: "call-A" }), { runId: "run-1" })
    h.builder.onBeforeToolCall({ toolName: "exec", params: { command: "ls" }, runId: "run-1", toolCallId: "t1" }, {})
    h.clock.now = 1_000_300
    h.builder.onAfterToolCall(
      { toolName: "exec", params: { command: "ls" }, runId: "run-1", toolCallId: "t1", result: "a b" },
      {},
    )
    h.clock.now = 1_000_400
    h.builder.onModelCallStarted(modelStart({ callId: "call-B" }), { runId: "run-1" })
    h.clock.now = 1_000_500
    h.builder.onModelCallEnded(modelEnd({ callId: "call-B", timeToFirstByteMs: 0 }), { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    const transcript = [
      { role: "user", content: "prior", timestamp: 1 },
      { role: "user", content: "hello", timestamp: 1_000_050 },
      assistant("", 1_000_150, {
        content: [{ type: "toolCall", id: "t1", name: "exec", arguments: { command: "ls" } }],
        stopReason: "toolUse",
        responseId: "resp-A",
      }),
      {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "exec",
        content: [{ type: "text", text: "a b" }],
        isError: false,
        timestamp: 1_000_300,
      },
      assistant("two files", 1_000_450, {
        responseId: "resp-B",
        usage: { input: 200, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 210, cost: { total: 0 } },
      }),
    ]
    h.builder.onAgentEnd(agentEnd({ messages: transcript }), ctx())

    const result = h.emitted[0] as BuildResult
    const calls = byName(result, "llm_request")
    expect(calls).toHaveLength(2)
    const [a, b] = calls as [SpanRecord, SpanRecord]
    expect(a.attrs["gen_ai.operation.name"]).toBe("chat")
    expect(a.attrs["gen_ai.provider.name"]).toBe("openai")
    expect(a.attrs["gen_ai.request.model"]).toBe("gpt-5")
    expect(a.attrs["gen_ai.response.id"]).toBe("resp-A")
    expect(a.attrs["gen_ai.response.finish_reasons"]).toEqual(["tool_calls"])
    expect(a.attrs["gen_ai.usage.input_tokens"]).toBe(100)
    expect(a.attrs["gen_ai.usage.output_tokens"]).toBe(20)
    expect(a.attrs["gen_ai.usage.cache_read.input_tokens"]).toBe(30)
    expect(a.attrs["gen_ai.usage.reasoning_tokens"]).toBe(5)
    expect(a.attrs["gen_ai.usage.total_tokens"]).toBe(150)
    expect(a.attrs["gen_ai.usage.cost"]).toBeCloseTo(0.0031)
    expect(a.attrs["gen_ai.usage.input_cost"]).toBeCloseTo(0.0011)
    expect(a.attrs["gen_ai.server.time_to_first_token"]).toBe(40_000_000)
    expect(a.attrs["gen_ai.tool.definitions:gated"]).toEqual([
      { type: "function", name: "exec", description: "run", parameters: { type: "object" } },
    ])
    expect(a.attrs["gen_ai.output.messages:gated"]).toEqual([
      { role: "assistant", parts: [{ type: "tool_call", id: "t1", name: "exec", arguments: { command: "ls" } }] },
    ])
    expect(a.attrs["gen_ai.input.messages:gated"]).toEqual([
      { role: "user", parts: [{ type: "text", content: "prior" }] },
      { role: "user", parts: [{ type: "text", content: "hello" }] },
    ])

    expect(b.attrs["gen_ai.usage.input_tokens"]).toBe(200)
    expect(b.attrs["gen_ai.usage.cost"]).toBeUndefined()
    expect(b.attrs["gen_ai.server.time_to_first_token"]).toBeUndefined()
    expect(b.attrs["gen_ai.response.finish_reasons"]).toEqual(["stop"])
    const bInput = b.attrs["gen_ai.input.messages:gated"] as Array<{ role: string }>
    expect(bInput.map((m) => m.role)).toEqual(["user", "user", "assistant", "tool"])
    expect(b.attrs["gen_ai.output.messages:gated"]).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "two files" }] },
    ])
    expect(root(result).attrs["openclaw.llm_calls"]).toBe(2)
    expect(root(result).attrs["openclaw.tool_calls"]).toBe(1)
  })

  it("ignores a previous run's response that sits inside the start slack", () => {
    const h = harness()
    h.clock.now = 1_000_000
    h.builder.onLlmInput(llmInput(), ctx())
    h.clock.now = 1_000_100
    h.builder.onModelCallStarted(modelStart({ callId: "call-A" }), { runId: "run-1" })
    h.clock.now = 1_000_200
    h.builder.onModelCallEnded(modelEnd({ callId: "call-A" }), { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    const transcript = [
      { role: "user", content: "earlier", timestamp: 990_000 },
      assistant("previous answer", 998_000, { responseId: "resp-prev" }),
      { role: "user", content: "hello", timestamp: 1_000_050 },
      assistant("this answer", 1_000_150, { responseId: "resp-A" }),
    ]
    h.builder.onAgentEnd(agentEnd({ messages: transcript, durationMs: 200 }), ctx())
    const result = h.emitted[0] as BuildResult
    const calls = byName(result, "llm_request")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.attrs["gen_ai.response.id"]).toBe("resp-A")
    expect(root(result).attrs["openclaw.llm_calls"]).toBe(1)
  })

  it("falls back to the attempt aggregate on the last call when no transcript message matches", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onModelCallEnded(modelEnd(), { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd({ messages: [] }), ctx())
    const call = byName(h.emitted[0] as BuildResult, "llm_request")[0] as SpanRecord
    expect(call.attrs["gen_ai.usage.input_tokens"]).toBe(10)
    expect(call.attrs["gen_ai.usage.total_tokens"]).toBe(16)
    expect(call.attrs["openclaw.usage.scope"]).toBe("attempt")
  })

  it("synthesizes chat spans from the transcript when no model_call hooks fired", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(
      agentEnd({
        messages: [
          { role: "user", content: "hello", timestamp: 1_000_005 },
          assistant("one", 1_000_010),
          { role: "toolResult", toolCallId: "x", toolName: "exec", content: [], isError: false, timestamp: 1_000_020 },
          assistant("two", 1_000_030),
        ],
      }),
      ctx(),
    )
    const calls = byName(h.emitted[0] as BuildResult, "llm_request")
    expect(calls).toHaveLength(2)
    expect(calls[0]?.attrs["openclaw.call.source"]).toBe("transcript")
    expect(calls[0]?.startMs).toBe(1_000_005)
    expect(calls[0]?.endMs).toBe(1_000_010)
    expect(calls[1]?.startMs).toBe(1_000_020)
    expect(calls[1]?.endMs).toBe(1_000_030)
    expect(calls[0]?.attrs["gen_ai.usage.input_tokens"]).toBe(100)
    expect(calls[1]?.attrs["gen_ai.output.messages:gated"]).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "two" }] },
    ])
  })

  it("puts the attempt aggregate on the last call when no transcript message carried usage", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(
      agentEnd({
        messages: [
          assistant("planning", 1_000_010, { usage: undefined }),
          assistant("", 1_000_020, {
            usage: undefined,
            stopReason: "toolUse",
            content: [{ type: "toolCall", id: "y", name: "sessions_yield", arguments: {} }],
          }),
        ],
      }),
      ctx(),
    )
    const calls = byName(h.emitted[0] as BuildResult, "llm_request")
    expect(calls).toHaveLength(2)
    expect(calls[0]?.attrs["gen_ai.usage.total_tokens"]).toBeUndefined()
    expect(calls[1]?.attrs["gen_ai.usage.total_tokens"]).toBe(16)
    expect(calls[1]?.attrs["openclaw.usage.scope"]).toBe("attempt")
  })

  it("marks a failed provider call as an error", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onModelCallEnded(modelEnd({ outcome: "error", errorCategory: "rate_limit", failureKind: "timeout" }), {
      runId: "run-1",
    })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd({ success: false }), ctx())
    const call = byName(h.emitted[0] as BuildResult, "llm_request")[0] as SpanRecord
    expect(call.outcome).toBe("error")
    expect(call.attrs["error.type"]).toBe("rate_limit")
    expect(call.attrs["openclaw.failure.kind"]).toBe("timeout")
  })

  it("force-closes calls and tools still open at agent_end as abandoned", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onBeforeToolCall({ toolName: "exec", params: {}, runId: "run-1", toolCallId: "t1" }, {})
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd({ success: false, error: "aborted" }), ctx())
    const result = h.emitted[0] as BuildResult
    expect(byName(result, "llm_request")[0]?.attrs["openclaw.outcome"]).toBe("abandoned")
    expect(byName(result, "tool_call:exec")[0]?.attrs["error.type"]).toBe("abandoned")
  })
})

describe("tool spans", () => {
  it("emits execute_tool client spans as siblings of llm_request with args and result", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall(
      { toolName: "web_fetch", params: { url: "https://x" }, runId: "run-1", toolCallId: "t1" },
      {},
    )
    h.builder.onAfterToolCall(
      {
        toolName: "web_fetch",
        params: { url: "https://x" },
        runId: "run-1",
        toolCallId: "t1",
        result: { content: [{ type: "text", text: "ok" }] },
        durationMs: 12,
      },
      {},
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const result = h.emitted[0] as BuildResult
    const tool = byName(result, "tool_call:web_fetch")[0] as SpanRecord
    expect(tool.kind).toBe(3)
    expect(tool.parentSpanId).toBe(root(result).spanId)
    expect(tool.attrs["gen_ai.operation.name"]).toBe("execute_tool")
    expect(tool.attrs["gen_ai.tool.name"]).toBe("web_fetch")
    expect(tool.attrs["gen_ai.tool.call.id"]).toBe("t1")
    expect(tool.attrs["gen_ai.tool.call.arguments:gated"]).toEqual({ url: "https://x" })
    expect(tool.attrs["gen_ai.tool.call.result:gated"]).toEqual({ content: [{ type: "text", text: "ok" }] })
    expect(tool.attrs["tool.is_error"]).toBe(false)
    expect(tool.outcome).toBe("ok")
  })

  it("records tool errors", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall({ toolName: "exec", params: {}, runId: "run-1", toolCallId: "t1" }, {})
    h.builder.onAfterToolCall({ toolName: "exec", params: {}, runId: "run-1", toolCallId: "t1", error: "exit 1" }, {})
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const tool = byName(h.emitted[0] as BuildResult, "tool_call:exec")[0] as SpanRecord
    expect(tool.outcome).toBe("error")
    expect(tool.attrs["tool.is_error"]).toBe(true)
    expect(tool.attrs["error.message:gated"]).toBe("exit 1")
  })

  it("opens the run from a tool hook when llm_input was missed", () => {
    const h = harness()
    h.builder.onBeforeToolCall(
      { toolName: "exec", params: {}, runId: "run-9", toolCallId: "t1" },
      { agentId: "main", sessionKey: "k", sessionId: "s9" },
    )
    h.builder.onAfterToolCall({ toolName: "exec", params: {}, runId: "run-9", toolCallId: "t1", result: "x" }, {})
    h.builder.onLlmOutput(llmOutput({ runId: "run-9" }), { runId: "run-9" })
    h.builder.onAgentEnd(agentEnd(), { runId: "run-9" })
    const result = h.emitted[0] as BuildResult
    expect(result.runId).toBe("run-9")
    expect(root(result).attrs["session.id"]).toBe("s9")
  })

  it("matches after_tool_call by name when the id differs", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall({ toolName: "exec", params: {}, runId: "run-1" }, {})
    h.builder.onAfterToolCall({ toolName: "exec", params: {}, runId: "run-1", toolCallId: "real", result: "x" }, {})
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const tool = byName(h.emitted[0] as BuildResult, "tool_call:exec")[0] as SpanRecord
    expect(tool.outcome).toBe("ok")
    expect(tool.attrs["gen_ai.tool.call.result:gated"]).toBe("x")
  })
})

describe("memory spans", () => {
  it("nests search_memory under a memory_search tool call", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall(
      { toolName: "memory_search", params: { query: "coffee" }, runId: "run-1", toolCallId: "t1" },
      {},
    )
    h.builder.onAfterToolCall(
      {
        toolName: "memory_search",
        params: { query: "coffee" },
        runId: "run-1",
        toolCallId: "t1",
        result: {
          content: [{ type: "text", text: "..." }],
          details: { results: [{ path: "MEMORY.md", startLine: 3, snippet: "coffee black", score: 0.9 }] },
        },
      },
      {},
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const result = h.emitted[0] as BuildResult
    const tool = byName(result, "tool_call:memory_search")[0] as SpanRecord
    const mem = byName(result, "search_memory")[0] as SpanRecord
    expect(mem.parentSpanId).toBe(tool.spanId)
    expect(mem.kind).toBe(3)
    expect(mem.attrs["gen_ai.operation.name"]).toBe("search_memory")
    expect(mem.attrs["gen_ai.memory.store.id"]).toBe("openclaw/main")
    expect(mem.attrs["gen_ai.memory.query.text:gated"]).toBe("coffee")
    expect(mem.attrs["gen_ai.memory.record.count"]).toBe(1)
    expect(mem.attrs["gen_ai.memory.records:gated"]).toEqual([
      { id: "MEMORY.md#3", content: "coffee black", score: 0.9 },
    ])
  })

  it("records a MEMORY.md write as upsert_memory with the full body", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall(
      {
        toolName: "write",
        params: { path: "MEMORY.md", content: "# Memory\n- teal" },
        runId: "run-1",
        toolCallId: "t1",
      },
      {},
    )
    h.builder.onAfterToolCall(
      {
        toolName: "write",
        params: { path: "MEMORY.md", content: "# Memory\n- teal" },
        runId: "run-1",
        toolCallId: "t1",
        result: "ok",
      },
      {},
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const mem = byName(h.emitted[0] as BuildResult, "upsert_memory")[0] as SpanRecord
    expect(mem.attrs["gen_ai.memory.record.id"]).toBe("MEMORY.md")
    expect(mem.attrs["gen_ai.memory.records:gated"]).toEqual([{ id: "MEMORY.md", content: "# Memory\n- teal" }])
  })

  it("reads an edited memory file back from disk", () => {
    const h = harness()
    h.files.set("/ws/memory/2026-09-09.md", "note after edit")
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall(
      {
        toolName: "edit",
        params: { path: "memory/2026-09-09.md", oldText: "a", newText: "b" },
        runId: "run-1",
        toolCallId: "t1",
      },
      {},
    )
    h.builder.onAfterToolCall(
      {
        toolName: "edit",
        params: { path: "memory/2026-09-09.md", oldText: "a", newText: "b" },
        runId: "run-1",
        toolCallId: "t1",
        result: "ok",
      },
      {},
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const mem = byName(h.emitted[0] as BuildResult, "upsert_memory")[0] as SpanRecord
    expect(mem.attrs["gen_ai.memory.records:gated"]).toEqual([
      { id: "memory/2026-09-09.md", content: "note after edit" },
    ])
  })

  it("ignores writes outside the memory scope", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall(
      { toolName: "write", params: { path: "src/app.ts", content: "x" }, runId: "run-1", toolCallId: "t1" },
      {},
    )
    h.builder.onAfterToolCall(
      {
        toolName: "write",
        params: { path: "src/app.ts", content: "x" },
        runId: "run-1",
        toolCallId: "t1",
        result: "ok",
      },
      {},
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    expect(byName(h.emitted[0] as BuildResult, "upsert_memory")).toHaveLength(0)
  })

  it("emits the session snapshot once per session", () => {
    const h = harness()
    h.files.set("/ws/MEMORY.md", "# Memory\n- teal")
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    h.builder.onLlmInput(llmInput({ runId: "run-2" }), ctx({ runId: "run-2" }))
    h.builder.onLlmOutput(llmOutput({ runId: "run-2" }), ctx({ runId: "run-2" }))
    h.builder.onAgentEnd(agentEnd(), ctx({ runId: "run-2" }))
    const first = byName(h.emitted[0] as BuildResult, "search_memory")
    expect(first).toHaveLength(1)
    expect(first[0]?.attrs["openclaw.memory.source"]).toBe("session_snapshot")
    expect(first[0]?.attrs["gen_ai.memory.records:gated"]).toEqual([{ id: "MEMORY.md", content: "# Memory\n- teal" }])
    expect(byName(h.emitted[1] as BuildResult, "search_memory")).toHaveLength(0)
    h.builder.onSessionStart({ sessionId: "sess-2", sessionKey: "agent:main:slack:channel:C1" }, {})
    h.builder.onLlmInput(llmInput({ runId: "run-3" }), ctx({ runId: "run-3", sessionId: "sess-2" }))
    h.builder.onLlmOutput(llmOutput({ runId: "run-3" }), ctx({ runId: "run-3" }))
    h.builder.onAgentEnd(agentEnd(), ctx({ runId: "run-3" }))
    expect(byName(h.emitted[2] as BuildResult, "search_memory")).toHaveLength(1)
  })

  it("keeps memory spans but drops bodies when memoryContent is off", () => {
    const h = harness({ memoryContent: false })
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall(
      { toolName: "memory_search", params: { query: "q" }, runId: "run-1", toolCallId: "t1" },
      {},
    )
    h.builder.onAfterToolCall(
      {
        toolName: "memory_search",
        params: { query: "q" },
        runId: "run-1",
        toolCallId: "t1",
        result: { details: { results: [{ path: "MEMORY.md", snippet: "s" }] } },
      },
      {},
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const mem = byName(h.emitted[0] as BuildResult, "search_memory")[0] as SpanRecord
    expect(mem.attrs["gen_ai.memory.record.count"]).toBe(1)
    expect(mem.attrs["gen_ai.memory.records:gated"]).toBeUndefined()
    expect(mem.attrs["gen_ai.memory.query.text:gated"]).toBeUndefined()
  })
})

describe("subagents", () => {
  const parentKey = "agent:main:slack:channel:C1"
  const childKey = "agent:main:subagent:abc"

  function spawnFromParent(h: Harness): void {
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeToolCall(
      { toolName: "sessions_spawn", params: { task: "haiku" }, runId: "run-1", toolCallId: "t1" },
      {},
    )
    h.builder.onAfterToolCall(
      { toolName: "sessions_spawn", params: { task: "haiku" }, runId: "run-1", toolCallId: "t1", result: "spawned" },
      {},
    )
    h.builder.onSubagentSpawned(
      { runId: "child-1", childSessionKey: childKey, agentId: "main", label: "haiku-writer", mode: "run" },
      { runId: "child-1", childSessionKey: childKey, requesterSessionKey: parentKey },
    )
  }

  it("nests the child run under the parent's spawn tool span in the parent's trace and session", () => {
    const h = harness()
    spawnFromParent(h)
    const childCtx = ctx({
      runId: "child-1",
      sessionId: "sess-child",
      sessionKey: childKey,
      trigger: "user",
      senderId: undefined,
    })
    h.builder.onLlmInput(llmInput({ runId: "child-1", sessionId: "sess-child", prompt: "write a haiku" }), childCtx)
    h.builder.onLlmOutput(llmOutput({ runId: "child-1" }), childCtx)
    h.builder.onAgentEnd(agentEnd(), childCtx)
    h.builder.onSubagentEnded(
      { runId: "child-1", targetSessionKey: childKey, reason: "done", outcome: "ok" },
      { runId: "child-1", requesterSessionKey: parentKey },
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())

    const child = h.emitted.find((r) => r.runId === "child-1") as BuildResult
    const parent = h.emitted.find((r) => r.runId === "run-1") as BuildResult
    const parentRoot = root(parent)
    const spawnTool = byName(parent, "tool_call:sessions_spawn")[0] as SpanRecord
    const wrapper = byName(parent, "subagent")[0] as SpanRecord
    expect(wrapper.parentSpanId).toBe(spawnTool.spanId)
    expect(wrapper.attrs["openclaw.subagent.outcome"]).toBe("ok")
    expect(wrapper.attrs["gen_ai.agent.name"]).toBe("haiku-writer")
    const childRoot = root(child)
    expect(childRoot.traceId).toBe(parentRoot.traceId)
    expect(childRoot.parentSpanId).toBe(wrapper.spanId)
    expect(childRoot.attrs["session.id"]).toBe("sess-1")
    expect(childRoot.attrs["openclaw.session.id"]).toBe("sess-child")
    expect(childRoot.attrs["gen_ai.agent.name"]).toBe("haiku-writer")
    expect(childRoot.attrs["interaction.kind"]).toBe("subagent")
    expect(parentRoot.attrs["latitude.tags"]).toContain("subagent:main")
    expect(h.builder.subagentLinkCount()).toBe(0)
  })

  it("re-parents a child whose run opened before the spawn hook", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    const childCtx = ctx({ runId: "child-1", sessionId: "sess-child", sessionKey: childKey })
    h.builder.onLlmInput(llmInput({ runId: "child-1" }), childCtx)
    h.builder.onSubagentSpawned(
      { runId: "child-1", childSessionKey: childKey, agentId: "main" },
      { runId: "child-1", requesterSessionKey: parentKey },
    )
    h.builder.onLlmOutput(llmOutput({ runId: "child-1" }), childCtx)
    h.builder.onAgentEnd(agentEnd(), childCtx)
    const child = h.emitted[0] as BuildResult
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    expect(root(child).traceId).toBe(root(h.emitted[1] as BuildResult).traceId)
  })

  it("ships the subagent wrapper on its own when it ends after the parent", () => {
    const h = harness()
    spawnFromParent(h)
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    expect(h.emitted).toHaveLength(1)
    h.builder.onSubagentEnded(
      { runId: "child-1", outcome: "error", error: "timeout" },
      { runId: "child-1", requesterSessionKey: parentKey },
    )
    expect(h.emitted).toHaveLength(2)
    const wrapper = (h.emitted[1] as BuildResult).spans[0] as SpanRecord
    expect(wrapper.name).toBe("subagent")
    expect(wrapper.outcome).toBe("error")
    expect(wrapper.traceId).toBe(root(h.emitted[0] as BuildResult).traceId)
  })
})

describe("compaction", () => {
  const key = "agent:main:slack:channel:C1"
  const compactionRow = JSON.stringify({
    type: "compaction",
    id: "c1",
    parentId: "m9",
    summary: "We discussed teal and coffee.",
    tokensBefore: 90_000,
    tokensAfter: 20_000,
  })

  it("attaches an in-run compaction to the open run as a chat span with the compacted messages and the summary", () => {
    const h = harness({ stateDir: "/state", readTranscriptRows: () => [compactionRow] })
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onBeforeCompaction(
      { messageCount: 40, tokenCount: 90_000, messages: [{ role: "user", content: "old" }] },
      { sessionKey: key },
    )
    h.builder.onAfterCompaction({ messageCount: 8, compactedCount: 32, tokenCount: 20_000 }, { sessionKey: key })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const span = byName(h.emitted[0] as BuildResult, "compaction")[0] as SpanRecord
    expect(span.parentSpanId).toBe(root(h.emitted[0] as BuildResult).spanId)
    expect(span.attrs["gen_ai.operation.name"]).toBe("chat")
    expect(span.attrs["gen_ai.request.model"]).toBe("gpt-5")
    expect(span.attrs["openclaw.compaction.compacted_count"]).toBe(32)
    expect(span.attrs["gen_ai.input.messages:gated"]).toEqual([
      { role: "user", parts: [{ type: "text", content: "old" }] },
    ])
    expect(span.attrs["gen_ai.output.messages:gated"]).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "We discussed teal and coffee." }] },
    ])
    expect(span.attrs["openclaw.usage.state"]).toBe("unreported")
  })

  it("ships a standalone compaction as an interaction root with the summary when no run is open", () => {
    const h = harness({
      stateDir: "/state",
      readTranscriptRows: (_db, sessionId) => (sessionId === "sess-1" ? [compactionRow] : undefined),
    })
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    h.builder.onBeforeCompaction(
      { messageCount: 40, messages: [{ role: "user", content: "old" }] },
      { sessionKey: key },
    )
    h.builder.onAfterCompaction({ messageCount: 8, compactedCount: 32 }, { sessionKey: key })
    expect(h.emitted).toHaveLength(2)
    const result = h.emitted[1] as BuildResult
    const [r, span] = result.spans as [SpanRecord, SpanRecord]
    expect(r.name).toBe("compaction")
    expect(r.parentSpanId).toBe("")
    expect(r.attrs["gen_ai.operation.name"]).toBe("invoke_agent")
    expect(r.attrs["interaction.kind"]).toBe("compaction")
    expect(r.attrs["user_prompt:gated"]).toBe("[compaction] 32 messages summarized, 8 kept")
    expect(r.attrs["session.id"]).toBe("sess-1")
    expect(r.attrs["latitude.tags"]).toEqual(["openclaw", "main"])
    expect(span.parentSpanId).toBe(r.spanId)
    expect(span.attrs["session.id"]).toBe("sess-1")
    expect(span.attrs["gen_ai.request.model"]).toBe("gpt-5")
    expect(span.attrs["openclaw.compaction.token_count.before"]).toBe(90_000)
    expect(span.attrs["gen_ai.output.messages:gated"]).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "We discussed teal and coffee." }] },
    ])
  })

  it("keeps concurrent standalone compactions of different sessions apart", () => {
    const h = harness()
    const keyB = "agent:main:slack:channel:C2"
    h.builder.onSessionStart({ sessionId: "sess-1", sessionKey: key }, { agentId: "main" })
    h.builder.onSessionStart({ sessionId: "sess-2", sessionKey: keyB }, { agentId: "main" })
    h.builder.onBeforeCompaction({ messageCount: 40, messages: [{ role: "user", content: "a" }] }, { sessionKey: key })
    h.builder.onBeforeCompaction({ messageCount: 20, messages: [{ role: "user", content: "b" }] }, { sessionKey: keyB })
    h.builder.onAfterCompaction({ messageCount: 8, compactedCount: 32 }, { sessionKey: key })
    h.builder.onAfterCompaction({ messageCount: 4, compactedCount: 16 }, { sessionKey: keyB })
    expect(h.emitted).toHaveLength(2)
    const [a, b] = h.emitted.map((r) => r.spans[1] as SpanRecord)
    expect(a?.attrs["session.id"]).toBe("sess-1")
    expect(a?.attrs["openclaw.compaction.message_count.before"]).toBe(40)
    expect(a?.attrs["openclaw.compaction.compacted_count"]).toBe(32)
    expect(b?.attrs["session.id"]).toBe("sess-2")
    expect(b?.attrs["openclaw.compaction.message_count.before"]).toBe(20)
    expect(b?.attrs["openclaw.compaction.compacted_count"]).toBe(16)
  })

  it("still ships a standalone compaction when the summary cannot be read", () => {
    const h = harness()
    h.builder.onSessionStart({ sessionId: "sess-1", sessionKey: key }, { agentId: "main" })
    h.builder.onBeforeCompaction({ messageCount: 40 }, { sessionKey: key, agentId: "main" })
    h.builder.onAfterCompaction({ messageCount: 8, compactedCount: 32 }, { sessionKey: key, agentId: "main" })
    const result = h.emitted[0] as BuildResult
    expect(result.spans.map((s) => s.name)).toEqual(["compaction", "compaction"])
    expect(result.spans[1]?.parentSpanId).toBe(result.spans[0]?.spanId)
    expect(byName(result, "compaction")[0]?.attrs["gen_ai.output.messages:gated"]).toBeUndefined()
  })
})

describe("cron", () => {
  it("derives the job from an isolated cron session key", () => {
    const h = harness()
    const c = ctx({ trigger: "cron", senderId: undefined, sessionKey: "agent:main:cron:octopus-fact:run:r1" })
    h.builder.onCronChanged({
      action: "started",
      jobId: "octopus-fact",
      job: { id: "octopus-fact", name: "Octopus fact" },
      sessionKey: "agent:main:cron:octopus-fact:run:r1",
    })
    h.builder.onLlmInput(llmInput(), c)
    h.builder.onLlmOutput(llmOutput(), c)
    h.builder.onAgentEnd(agentEnd(), c)
    const r = root(h.emitted[0] as BuildResult)
    expect(r.attrs["latitude.tags"]).toEqual(["openclaw", "slack", "main", "cron:octopus-fact"])
    const metadata = r.attrs["latitude.metadata"] as Record<string, string>
    expect(metadata["openclaw.cron.job.id"]).toBe("octopus-fact")
    expect(metadata["openclaw.cron.job.name"]).toBe("Octopus fact")
    expect(r.attrs["interaction.kind"]).toBe("cron")
  })

  it("falls back to the latest started job for the agent when the key carries none", () => {
    const h = harness()
    const c = ctx({ trigger: "cron", senderId: undefined })
    h.builder.onCronChanged({ action: "started", jobId: "daily", agentId: "main" })
    h.builder.onLlmInput(llmInput(), c)
    h.builder.onLlmOutput(llmOutput(), c)
    h.builder.onAgentEnd(agentEnd(), c)
    expect(root(h.emitted[0] as BuildResult).attrs["latitude.tags"]).toContain("cron:daily")
    h.builder.onCronChanged({ action: "finished", jobId: "daily", agentId: "main" })
    h.builder.onLlmInput(llmInput({ runId: "run-2" }), ctx({ runId: "run-2", trigger: "cron", senderId: undefined }))
    h.builder.onLlmOutput(llmOutput({ runId: "run-2" }), ctx({ runId: "run-2" }))
    h.builder.onAgentEnd(agentEnd(), ctx({ runId: "run-2" }))
    expect(root(h.emitted[1] as BuildResult).attrs["latitude.tags"]).toContain("cron")
    expect(root(h.emitted[1] as BuildResult).attrs["latitude.tags"]).not.toContain("cron:daily")
  })
})

describe("housekeeping", () => {
  it("ignores agent_end for unknown runs", () => {
    const h = harness()
    h.builder.onAgentEnd(agentEnd(), ctx({ runId: "ghost" }))
    expect(h.emitted).toHaveLength(0)
  })

  it("exports a run that never ended once it outlives the TTL", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.clock.now += 3 * 60 * 60 * 1000
    h.builder.onLlmInput(llmInput({ runId: "run-2" }), ctx({ runId: "run-2" }))
    expect(h.emitted).toHaveLength(1)
    expect(root(h.emitted[0] as BuildResult).attrs["openclaw.outcome"]).toBe("abandoned")
  })
})

describe("harnesses that withhold history (Codex)", () => {
  const codexCtx = (runId: string) =>
    ctx({ runId, sessionKey: "agent:main:main", channel: "webchat", senderId: undefined })

  it("prepends the previous turns this process saw to every input of the next run", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput({ historyMessages: [], prompt: "first" }), codexCtx("run-1"))
    h.builder.onLlmOutput(llmOutput(), codexCtx("run-1"))
    h.builder.onAgentEnd(
      agentEnd({ messages: [{ role: "user", content: "first", timestamp: 1_000_001 }, assistant("one", 1_000_010)] }),
      codexCtx("run-1"),
    )
    expect(root(h.emitted[0] as BuildResult).attrs["openclaw.history.source"]).toBe("none")

    h.builder.onLlmInput(llmInput({ runId: "run-2", historyMessages: [], prompt: "second" }), codexCtx("run-2"))
    h.builder.onLlmOutput(llmOutput({ runId: "run-2" }), codexCtx("run-2"))
    h.builder.onAgentEnd(
      agentEnd({ messages: [{ role: "user", content: "second", timestamp: 1_000_101 }, assistant("two", 1_000_110)] }),
      codexCtx("run-2"),
    )
    const second = h.emitted[1] as BuildResult
    const r = root(second)
    expect(r.attrs["openclaw.history.source"]).toBe("memory")
    expect(r.attrs["openclaw.history.messages"]).toBe(2)
    expect((r.attrs["gen_ai.input.messages:gated"] as Message[]).map((m) => m.parts[0]?.content)).toEqual([
      "first",
      "one",
      "second",
    ])
    const call = byName(second, "llm_request")[0] as SpanRecord
    expect((call.attrs["gen_ai.input.messages:gated"] as Message[]).map((m) => m.parts[0]?.content)).toEqual([
      "first",
      "one",
      "second",
    ])
  })

  it("reads OpenClaw's transcript mirror on a cold start and drops the already-persisted prompt", () => {
    const transcript = [
      JSON.stringify({ type: "session", id: "s0", parentId: null }),
      JSON.stringify({
        type: "message",
        id: "m1",
        parentId: "s0",
        message: { role: "user", content: "old question", timestamp: 1 },
      }),
      JSON.stringify({
        type: "message",
        id: "m2",
        parentId: "m1",
        message: { role: "assistant", content: [{ type: "text", text: "old answer" }], timestamp: 2 },
      }),
      JSON.stringify({
        type: "message",
        id: "m3",
        parentId: "m2",
        message: { role: "user", content: "new question", timestamp: 3 },
      }),
    ].join("\n")
    const h = harness({
      readTranscript: (path) => (path === "/state/agents/main/sessions/sess-1.jsonl" ? transcript : undefined),
    })
    const c = codexCtx("run-1")
    c.workspaceDir = "/state/workspace"
    h.builder.onLlmInput(llmInput({ historyMessages: [], prompt: "new question" }), c)
    h.builder.onLlmOutput(llmOutput(), c)
    h.builder.onAgentEnd(agentEnd({ messages: [assistant("new answer", h.clock.now)] }), c)
    const r = root(h.emitted[0] as BuildResult)
    expect(r.attrs["openclaw.history.source"]).toBe("file")
    expect((r.attrs["gen_ai.input.messages:gated"] as Message[]).map((m) => m.parts[0]?.content)).toEqual([
      "old question",
      "old answer",
      "new question",
    ])
  })

  it("prefers the host's state dir over the workspace heuristic", () => {
    const paths: string[] = []
    const h = harness({
      stateDir: "/custom",
      readTranscript: (path) => {
        paths.push(path)
        return undefined
      },
    })
    h.builder.onLlmInput(llmInput({ historyMessages: [] }), codexCtx("run-1"))
    expect(paths).toEqual(["/custom/agents/main/sessions/sess-1.jsonl"])
  })

  it("keeps the harness's own history when it supplies one", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(
      agentEnd({ messages: [{ role: "user", content: "prior", timestamp: 1 }, assistant("x", h.clock.now)] }),
      ctx(),
    )
    expect(root(h.emitted[0] as BuildResult).attrs["openclaw.history.source"]).toBe("harness")
  })

  it("forgets a session's history when the session ends", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput({ historyMessages: [] }), codexCtx("run-1"))
    h.builder.onLlmOutput(llmOutput(), codexCtx("run-1"))
    h.builder.onAgentEnd(agentEnd({ messages: [assistant("one", h.clock.now)] }), codexCtx("run-1"))
    h.builder.onSessionEnd("agent:main:main", "sess-1")
    h.builder.onLlmInput(llmInput({ runId: "run-2", historyMessages: [] }), codexCtx("run-2"))
    h.builder.onLlmOutput(llmOutput({ runId: "run-2" }), codexCtx("run-2"))
    h.builder.onAgentEnd(agentEnd(), codexCtx("run-2"))
    expect(root(h.emitted[1] as BuildResult).attrs["openclaw.history.source"]).toBe("none")
  })
})

describe("agent event stream", () => {
  it("opens the run at lifecycle start and derives time to first token from the first delta", () => {
    const h = harness()
    h.builder.onAgentEvent({
      runId: "run-1",
      stream: "lifecycle",
      ts: 900_000,
      data: { phase: "start", startedAt: 900_000 },
      sessionKey: "agent:main:main",
      sessionId: "sess-1",
      agentId: "main",
    })
    expect(h.builder.inflightCount()).toBe(1)
    h.builder.onLlmInput(llmInput(), ctx())
    h.clock.now = 1_000_100
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onAgentEvent({ runId: "run-1", stream: "assistant", ts: 1_000_350, data: { text: "H", delta: "H" } })
    h.builder.onAgentEvent({ runId: "run-1", stream: "assistant", ts: 1_000_400, data: { text: "He", delta: "e" } })
    h.clock.now = 1_000_800
    const { timeToFirstByteMs: _dropped, ...ended } = modelEnd()
    h.builder.onModelCallEnded(ended, { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd({ durationMs: 100 }), ctx())
    const result = h.emitted[0] as BuildResult
    expect(root(result).startMs).toBe(900_000)
    const call = byName(result, "llm_request")[0] as SpanRecord
    expect(call.attrs["gen_ai.server.time_to_first_token"]).toBe(250_000_000)
    expect(call.attrs["openclaw.ttft.source"]).toBe("stream")
  })

  it("never overrides a TTFB the harness reported", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onAgentEvent({ runId: "run-1", stream: "assistant", ts: h.clock.now + 10, data: { delta: "x" } })
    h.builder.onModelCallEnded(modelEnd({ timeToFirstByteMs: 40 }), { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const call = byName(h.emitted[0] as BuildResult, "llm_request")[0] as SpanRecord
    expect(call.attrs["gen_ai.server.time_to_first_token"]).toBe(40_000_000)
    expect(call.attrs["openclaw.ttft.source"]).toBeUndefined()
  })
})

describe("identity details", () => {
  it("resolves a sender's name from any session once it was seen", () => {
    const h = harness()
    h.builder.onMessageReceived(
      { senderId: "U1", sessionKey: "agent:main:other", metadata: { senderName: "Alex" } },
      {},
    )
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const metadata = root(h.emitted[0] as BuildResult).attrs["latitude.metadata"] as Record<string, string>
    expect(metadata["openclaw.sender.name"]).toBe("Alex")
  })

  it("resolves a sender name that arrives after the run opened", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onMessageReceived(
      { senderId: "U1", sessionKey: "agent:main:slack:channel:C1", metadata: { senderName: "Alex" } },
      {},
    )
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const metadata = root(h.emitted[0] as BuildResult).attrs["latitude.metadata"] as Record<string, string>
    expect(metadata["openclaw.sender.name"]).toBe("Alex")
  })

  it("takes the cron job name from the prompt prefix when no cron event carried it", () => {
    const h = harness()
    const c = ctx({ trigger: "cron", senderId: undefined, sessionKey: "agent:main:cron:ca4b-9711:run:r1" })
    h.builder.onLlmInput(llmInput({ prompt: "[cron:ca4b-9711 Octopus fun fact] Recent conversation: ..." }), c)
    h.builder.onLlmOutput(llmOutput(), c)
    h.builder.onAgentEnd(agentEnd(), c)
    const metadata = root(h.emitted[0] as BuildResult).attrs["latitude.metadata"] as Record<string, string>
    expect(metadata["openclaw.cron.job.id"]).toBe("ca4b-9711")
    expect(metadata["openclaw.cron.job.name"]).toBe("Octopus fun fact")
  })

  it("labels announce runs and treats any spawn-named tool as the subagent anchor", () => {
    const h = harness()
    const c = ctx({ runId: "announce:codex-native:t1:r1:succeeded" })
    h.builder.onLlmInput(llmInput({ runId: c.runId as string }), c)
    h.builder.onBeforeToolCall(
      { toolName: "collaborationspawn_agent", params: {}, runId: c.runId as string, toolCallId: "t1" },
      {},
    )
    h.builder.onAfterToolCall(
      { toolName: "collaborationspawn_agent", params: {}, runId: c.runId as string, toolCallId: "t1", result: "ok" },
      {},
    )
    h.builder.onSubagentSpawned(
      { runId: "child", childSessionKey: "k", agentId: "main" },
      { runId: "child", requesterSessionKey: c.sessionKey },
    )
    h.builder.onLlmOutput(llmOutput({ runId: c.runId as string }), c)
    h.builder.onAgentEnd(agentEnd(), c)
    h.builder.onSubagentEnded({ runId: "child", outcome: "ok" }, { runId: "child", requesterSessionKey: c.sessionKey })
    const result = h.emitted[0] as BuildResult
    expect(root(result).attrs["interaction.kind"]).toBe("announce")
    const spawnTool = byName(result, "tool_call:collaborationspawn_agent")[0] as SpanRecord
    const wrapper = (h.emitted[1] as BuildResult).spans[0] as SpanRecord
    expect(wrapper.parentSpanId).toBe(spawnTool.spanId)
  })
})

describe("streamed reasoning", () => {
  it("prepends thinking deltas as a reasoning part when the transcript carries none", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.clock.now = 1_000_100
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onAgentEvent({ runId: "run-1", stream: "thinking", ts: 1_000_200, data: { delta: "Let me " } })
    h.builder.onAgentEvent({ runId: "run-1", stream: "thinking", ts: 1_000_250, data: { delta: "think." } })
    h.clock.now = 1_000_800
    h.builder.onModelCallEnded(modelEnd(), { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd({ messages: [assistant("answer", 1_000_700)] }), ctx())
    const call = byName(h.emitted[0] as BuildResult, "llm_request")[0] as SpanRecord
    expect(call.attrs["gen_ai.output.messages:gated"]).toEqual([
      {
        role: "assistant",
        parts: [
          { type: "reasoning", content: "Let me think." },
          { type: "text", content: "answer" },
        ],
      },
    ])
    expect(call.attrs["openclaw.reasoning.source"]).toBe("stream")
  })

  it("leaves transcript reasoning alone", () => {
    const h = harness()
    h.builder.onLlmInput(llmInput(), ctx())
    h.builder.onModelCallStarted(modelStart(), { runId: "run-1" })
    h.builder.onAgentEvent({ runId: "run-1", stream: "thinking", ts: h.clock.now + 5, data: { delta: "stream" } })
    h.builder.onModelCallEnded(modelEnd(), { runId: "run-1" })
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(
      agentEnd({
        messages: [
          assistant("answer", h.clock.now + 50, {
            content: [
              { type: "thinking", thinking: "native" },
              { type: "text", text: "answer" },
            ],
          }),
        ],
      }),
      ctx(),
    )
    const call = byName(h.emitted[0] as BuildResult, "llm_request")[0] as SpanRecord
    expect((call.attrs["gen_ai.output.messages:gated"] as Message[])[0]?.parts[0]).toEqual({
      type: "reasoning",
      content: "native",
    })
    expect(call.attrs["openclaw.reasoning.source"]).toBeUndefined()
  })

  it("reads the sqlite store before the jsonl file on a cold start", () => {
    const h = harness({
      stateDir: "/state",
      readTranscriptRows: (dbPath, sessionId) =>
        dbPath === "/state/agents/main/sessions/../agent/openclaw-agent.sqlite".replace("sessions/../", "") &&
        sessionId === "sess-1"
          ? [
              JSON.stringify({
                type: "message",
                id: "m1",
                parentId: null,
                message: { role: "user", content: "from sqlite" },
              }),
            ]
          : undefined,
    })
    h.builder.onLlmInput(llmInput({ historyMessages: [] }), ctx({ senderId: undefined }))
    h.builder.onLlmOutput(llmOutput(), ctx())
    h.builder.onAgentEnd(agentEnd(), ctx())
    const r = root(h.emitted[0] as BuildResult)
    expect(r.attrs["openclaw.history.source"]).toBe("sqlite")
    expect((r.attrs["gen_ai.input.messages:gated"] as Message[])[0]?.parts[0]?.content).toBe("from sqlite")
  })
})
