import { describe, expect, it } from "vitest"
import { TurnBuilder } from "./turn-builder.ts"
import type {
  OpenClawAfterToolCallEvent,
  OpenClawAgentContext,
  OpenClawBeforeToolCallEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
} from "./types.ts"

function ctx(overrides: Partial<OpenClawAgentContext> = {}): OpenClawAgentContext {
  return {
    runId: "run-1",
    sessionId: "s-1",
    sessionKey: "sk-1",
    agentId: "router-agent",
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
    historyMessages: [],
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
    assistantTexts: ["hi"],
    lastAssistant: { role: "assistant", content: "hi" },
    usage: { input: 10, output: 5, total: 15 },
    ...overrides,
  }
}

describe("TurnBuilder", () => {
  it("pairs llm_input and llm_output by runId into a single call", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput(), ctx())
    b.onLlmOutput(llmOutput(), ctx())
    const run = b.onAgentEnd({ messages: [], success: true, durationMs: 100 }, ctx())

    expect(run).toBeDefined()
    expect(run?.llmCalls).toHaveLength(1)
    const call = run?.llmCalls[0]
    expect(call?.assistantTexts).toEqual(["hi"])
    expect(call?.usage?.total).toBe(15)
    expect(call?.endMs).toBeDefined()
    expect(call?.agentId).toBe("router-agent")
  })

  it("records multiple LLM calls in a tool loop on the same runId", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput({ prompt: "first" }), ctx())
    b.onLlmOutput(llmOutput(), ctx())
    b.onLlmInput(llmInput({ prompt: "second" }), ctx())
    b.onLlmOutput(llmOutput({ assistantTexts: ["done"] }), ctx())
    const run = b.onAgentEnd({ messages: [], success: true }, ctx())

    expect(run?.llmCalls).toHaveLength(2)
    expect(run?.llmCalls[0]?.prompt).toBe("first")
    expect(run?.llmCalls[1]?.prompt).toBe("second")
    expect(run?.llmCalls[1]?.assistantTexts).toEqual(["done"])
  })

  it("attaches tool calls arriving between llm_input and llm_output", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput(), ctx())
    const tool: OpenClawBeforeToolCallEvent = {
      toolName: "read_file",
      params: { path: "/foo" },
      runId: "run-1",
      toolCallId: "tc-1",
    }
    b.onBeforeToolCall(tool, ctx())
    const after: OpenClawAfterToolCallEvent = {
      toolName: "read_file",
      params: { path: "/foo" },
      runId: "run-1",
      toolCallId: "tc-1",
      result: { content: "hello" },
      durationMs: 42,
    }
    b.onAfterToolCall(after, ctx())
    b.onLlmOutput(llmOutput(), ctx())
    const run = b.onAgentEnd({ messages: [], success: true }, ctx())

    expect(run?.llmCalls[0]?.toolCalls).toHaveLength(1)
    const t = run?.llmCalls[0]?.toolCalls[0]
    expect(t?.toolName).toBe("read_file")
    expect(t?.result).toEqual({ content: "hello" })
    expect(t?.durationMs).toBe(42)
    expect(t?.error).toBeUndefined()
  })

  it("marks tool calls with errors correctly", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput(), ctx())
    b.onBeforeToolCall({ toolName: "crash", params: {}, runId: "run-1", toolCallId: "tc-x" }, ctx())
    b.onAfterToolCall({ toolName: "crash", params: {}, runId: "run-1", toolCallId: "tc-x", error: "boom" }, ctx())
    b.onLlmOutput(llmOutput(), ctx())
    const run = b.onAgentEnd({ messages: [], success: true }, ctx())

    expect(run?.llmCalls[0]?.toolCalls[0]?.error).toBe("boom")
  })

  it("stores tool calls as orphans when no LLM call is open", () => {
    const b = new TurnBuilder()
    // Tool before any llm_input — shouldn't happen in practice but we
    // defend against OpenClaw firing hooks out of the canonical order.
    b.onBeforeToolCall({ toolName: "lonely", params: {}, runId: "run-1", toolCallId: "tc-o" }, ctx())
    b.onAfterToolCall({ toolName: "lonely", params: {}, runId: "run-1", toolCallId: "tc-o", result: "ok" }, ctx())
    const run = b.onAgentEnd({ messages: [], success: true }, ctx())

    expect(run).toBeDefined()
    expect(run?.orphanTools).toHaveLength(1)
    expect(run?.orphanTools[0]?.result).toBe("ok")
  })

  it("falls back to name-based matching when toolCallId is missing on after_tool_call", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput(), ctx())
    b.onBeforeToolCall({ toolName: "grep", params: { q: "foo" }, runId: "run-1", toolCallId: "tc-1" }, ctx())
    b.onAfterToolCall({ toolName: "grep", params: { q: "foo" }, runId: "run-1", result: "3 matches" }, ctx())
    b.onLlmOutput(llmOutput(), ctx())
    const run = b.onAgentEnd({ messages: [], success: true }, ctx())

    expect(run?.llmCalls[0]?.toolCalls[0]?.result).toBe("3 matches")
  })

  it("propagates agent_end success/error into the RunRecord", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput(), ctx())
    b.onLlmOutput(llmOutput(), ctx())
    const run = b.onAgentEnd({ messages: [], success: false, error: "budget exceeded", durationMs: 5 }, ctx())

    expect(run?.success).toBe(false)
    expect(run?.error).toBe("budget exceeded")
  })

  it("closes still-open LLM calls on agent_end", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput(), ctx())
    // No llm_output — e.g. runtime crashed.
    const run = b.onAgentEnd({ messages: [], success: false, error: "crashed" }, ctx())
    expect(run?.llmCalls[0]?.endMs).toBeDefined()
    expect(run?.llmCalls[0]?.error).toBe("crashed")
  })

  it("keeps runs keyed independently by runId so subagent runs don't collide", () => {
    const b = new TurnBuilder()
    b.onLlmInput(llmInput({ runId: "parent" }), ctx({ runId: "parent", agentId: "parent-agent" }))
    b.onLlmInput(llmInput({ runId: "child" }), ctx({ runId: "child", agentId: "subagent-a", sessionKey: "sk-child" }))
    b.onLlmOutput(llmOutput({ runId: "child" }), ctx({ runId: "child" }))
    const childRun = b.onAgentEnd({ messages: [], success: true }, ctx({ runId: "child" }))
    expect(childRun?.runId).toBe("child")
    expect(childRun?.agentId).toBe("subagent-a")

    b.onLlmOutput(llmOutput({ runId: "parent" }), ctx({ runId: "parent" }))
    const parentRun = b.onAgentEnd({ messages: [], success: true }, ctx({ runId: "parent", agentId: "parent-agent" }))
    expect(parentRun?.runId).toBe("parent")
    expect(parentRun?.agentId).toBe("parent-agent")
  })
})
