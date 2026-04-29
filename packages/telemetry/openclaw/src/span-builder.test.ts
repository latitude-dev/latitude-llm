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

describe("SpanBuilder latitude.tags and latitude.metadata", () => {
  it("emits latitude.tags = [agentId, channelId, trigger] on the agent span", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx({ agentId: "personal", channelId: "telegram", trigger: "user" }))
    const result = b.onAgentEnd({ messages: [], success: true }, ctx({ trigger: "user" }))
    const agent = findSpan(result, "agent")
    expect(agent?.attrs["latitude.tags"]).toEqual(["personal", "telegram", "user"])
  })

  it("formats cron triggers as `cron:<jobId>`", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart(
      {},
      ctx({ agentId: "personal", channelId: "telegram", trigger: "cron", jobId: "morning-briefing" }),
    )
    const result = b.onAgentEnd({ messages: [], success: true }, ctx({ trigger: "cron", jobId: "morning-briefing" }))
    const agent = findSpan(result, "agent")
    expect(agent?.attrs["latitude.tags"]).toEqual(["personal", "telegram", "cron:morning-briefing"])
  })

  it("falls back to bare `cron` when trigger is cron but jobId is missing", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx({ trigger: "cron" }))
    const result = b.onAgentEnd({ messages: [], success: true }, ctx({ trigger: "cron" }))
    const agent = findSpan(result, "agent")
    const tags = agent?.attrs["latitude.tags"] as string[]
    expect(tags).toContain("cron")
    expect(tags).not.toContain("cron:undefined")
  })

  it("omits latitude.tags entirely when ctx has no agentId/channelId/trigger", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart(
      {},
      // Strip out the tag-source fields. We still need runId to open a run.
      { runId: "run-1", sessionId: "s-1" },
    )
    const result = b.onAgentEnd({ messages: [], success: true }, { runId: "run-1" })
    const agent = findSpan(result, "agent")
    expect(agent?.attrs["latitude.tags"]).toBeUndefined()
  })

  it("emits latitude.metadata as a flat string-map of openclaw.* fields", () => {
    const b = new SpanBuilder()
    b.onBeforeAgentStart(
      {},
      ctx({
        agentId: "personal",
        channelId: "telegram",
        trigger: "cron",
        jobId: "morning-briefing",
        messageProvider: "telegram",
        modelProviderId: "openai-codex",
        modelId: "gpt-5.4",
        workspaceDir: "/home/sans/.openclaw/workspaces/personal",
      }),
    )
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())
    const agent = findSpan(result, "agent")
    const meta = agent?.attrs["latitude.metadata"] as Record<string, string>
    expect(meta["openclaw.run.id"]).toBe("run-1")
    expect(meta["openclaw.session.id"]).toBe("s-1")
    expect(meta["openclaw.agent.id"]).toBe("personal")
    expect(meta["openclaw.channel.id"]).toBe("telegram")
    expect(meta["openclaw.trigger"]).toBe("cron")
    expect(meta["openclaw.cron.job.id"]).toBe("morning-briefing")
    expect(meta["openclaw.message.provider"]).toBe("telegram")
    expect(meta["openclaw.model.provider.id"]).toBe("openai-codex")
    expect(meta["openclaw.model.id"]).toBe("gpt-5.4")
    expect(meta["openclaw.workspace.dir"]).toBe("/home/sans/.openclaw/workspaces/personal")
  })

  it("propagates tags + metadata to model_call and tool_call spans (every span gets them)", () => {
    const b = new SpanBuilder()
    const fullCtx = ctx({ agentId: "personal", channelId: "telegram", trigger: "user" })
    b.onBeforeAgentStart({}, fullCtx)
    b.onModelCallStarted({ runId: "run-1", callId: "A", provider: "openai", model: "gpt-5" }, fullCtx)
    b.onModelCallEnded(
      { runId: "run-1", callId: "A", provider: "openai", model: "gpt-5", outcome: "completed" },
      fullCtx,
    )
    b.onBeforeToolCall({ toolName: "grep", params: { q: "x" }, runId: "run-1", toolCallId: "tc-1" }, fullCtx)
    b.onAfterToolCall(
      { toolName: "grep", params: { q: "x" }, runId: "run-1", toolCallId: "tc-1", result: "match" },
      fullCtx,
    )
    const result = b.onAgentEnd({ messages: [], success: true }, fullCtx)

    const expectedTags = ["personal", "telegram", "user"]
    for (const span of result?.spans ?? []) {
      expect(span.attrs["latitude.tags"]).toEqual(expectedTags)
      expect((span.attrs["latitude.metadata"] as Record<string, string>)["openclaw.agent.id"]).toBe("personal")
    }
  })
})

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
    // System instructions are normalized to the parts-shape Latitude's parser
    // expects — `[{type: "text", content: ...}]`, not a raw string.
    expect(agent?.attrs["gen_ai.system_instructions:gated"]).toEqual([{ type: "text", content: "be helpful" }])
    expect(agent?.attrs["user_prompt:gated"]).toBe("hi")
    expect(agent?.attrs["gen_ai.usage.input_tokens"]).toBe(100)
    expect(agent?.attrs["gen_ai.usage.output_tokens"]).toBe(20)
    expect(agent?.attrs["gen_ai.usage.total_tokens"]).toBe(120)
    expect(agent?.attrs["openclaw.resolved.ref"]).toBe("openai/gpt-5")

    // gen_ai.input.messages and gen_ai.output.messages must be in parts shape.
    const inputMessages = agent?.attrs["gen_ai.input.messages:gated"] as Array<{ role: string; parts: unknown[] }>
    expect(inputMessages.every((m) => Array.isArray(m.parts))).toBe(true)
    const outputMessages = agent?.attrs["gen_ai.output.messages:gated"] as Array<{ role: string; parts: unknown[] }>
    expect(outputMessages.every((m) => Array.isArray(m.parts))).toBe(true)
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

  it("evicts stale subagent links so the map stays bounded across orphaned spawns", () => {
    // Simulate what happens when many child runs never reach agent_end —
    // gateway crash mid-spawn, plugin reload, etc. Each spawned subagent
    // registers a link entry. The link entry gets cleaned up only when the
    // child's `agent_end` fires (via `onAgentEnd`) — without it, the map
    // would grow unbounded.
    //
    // We verify the eviction sweep by overriding Date.now between spawns
    // so the first batch is "old enough" to be evicted.
    const b = new SpanBuilder()
    const realNow = Date.now
    const FIXED_OLD = 1_000_000_000
    Date.now = () => FIXED_OLD

    // Spawn a parent agent + 3 subagents at t=0.
    b.onBeforeAgentStart({}, ctx({ runId: "parent" }))
    for (const childId of ["c1", "c2", "c3"]) {
      b.onSubagentSpawned(
        { runId: childId, childSessionKey: `sk-${childId}`, agentId: "child" },
        ctx({ runId: "parent" }),
      )
    }
    expect(b.subagentLinkCount()).toBe(3)

    // Jump well past the TTL and spawn one more — eviction sweep runs on
    // insert and drops the stale ones.
    Date.now = () => FIXED_OLD + 2 * 60 * 60 * 1000 // +2 hours
    b.onSubagentSpawned({ runId: "c4", childSessionKey: "sk-c4", agentId: "child" }, ctx({ runId: "parent" }))
    // Only the new entry should remain — the three old ones are gone.
    expect(b.subagentLinkCount()).toBe(1)

    Date.now = realNow
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

  it("falls back to name-matching when before/after_tool_call ids don't match", () => {
    // before_tool_call had no toolCallId → we synthesized one. after_tool_call
    // provides a real id (different). Without the fallback, the span would
    // never close.
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onBeforeToolCall({ toolName: "search", params: { q: "x" }, runId: "run-1" }, ctx())
    b.onAfterToolCall(
      { toolName: "search", params: { q: "x" }, runId: "run-1", toolCallId: "real-id-from-provider", result: "found" },
      ctx(),
    )
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const tool = findSpan(result, "tool_call:search")
    expect(tool?.outcome).toBe("ok")
    expect(tool?.attrs["gen_ai.tool.call.result:gated"]).toBe("found")
    // The span should be closed (not abandoned).
    expect(tool?.attrs["openclaw.outcome"]).not.toBe("abandoned")
  })

  it("matches the most-recently-opened tool when multiple in-flight share a name", () => {
    // Two in-flight calls with the same toolName, no ids on either side —
    // when the first after_tool_call arrives without an id, we should close
    // the most recently opened span (LIFO), not the first one in insertion
    // order.
    const b = new SpanBuilder()
    b.onBeforeAgentStart({}, ctx())
    b.onBeforeToolCall({ toolName: "search", params: { q: "first" }, runId: "run-1" }, ctx())
    b.onBeforeToolCall({ toolName: "search", params: { q: "second" }, runId: "run-1" }, ctx())
    // First completion lacks id — should close the SECOND span (the latest).
    b.onAfterToolCall({ toolName: "search", params: { q: "second" }, runId: "run-1", result: "second-result" }, ctx())
    // Second completion lacks id — should close the FIRST span (now the only open one).
    b.onAfterToolCall({ toolName: "search", params: { q: "first" }, runId: "run-1", result: "first-result" }, ctx())
    const result = b.onAgentEnd({ messages: [], success: true }, ctx())

    const tools = findAllSpans(result, "tool_call:search")
    expect(tools).toHaveLength(2)
    // Both closed (neither abandoned).
    expect(tools.every((t) => t.attrs["openclaw.outcome"] !== "abandoned")).toBe(true)
    // Order matters: the second-opened span should have got the second-result.
    // Find the one whose params.q is "second" — its result should be "second-result".
    const second = tools.find((t) => (t.attrs["gen_ai.tool.call.arguments:gated"] as { q: string }).q === "second")
    expect(second?.attrs["gen_ai.tool.call.result:gated"]).toBe("second-result")
    const first = tools.find((t) => (t.attrs["gen_ai.tool.call.arguments:gated"] as { q: string }).q === "first")
    expect(first?.attrs["gen_ai.tool.call.result:gated"]).toBe("first-result")
  })
})
