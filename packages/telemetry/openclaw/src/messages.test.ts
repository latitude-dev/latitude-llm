import { describe, expect, it } from "vitest"
import {
  assistantMessageFromOutput,
  normalizeMessage,
  normalizeMessages,
  systemInstructionsParts,
  userMessageFromPrompt,
} from "./messages.ts"

describe("normalizeMessage", () => {
  it("normalizes a string-content message into a single text part", () => {
    const m = normalizeMessage({ role: "user", content: "hello" })
    expect(m).toEqual({ role: "user", parts: [{ type: "text", content: "hello" }] })
  })

  it("normalizes Anthropic ContentBlock arrays — text + tool_use + tool_result", () => {
    const m = normalizeMessage({
      role: "assistant",
      content: [
        { type: "text", text: "let me search" },
        { type: "tool_use", id: "tu-1", name: "search", input: { q: "x" } },
      ],
    })
    expect(m?.role).toBe("assistant")
    expect(m?.parts).toEqual([
      { type: "text", content: "let me search" },
      { type: "tool_call", id: "tu-1", name: "search", arguments: { q: "x" } },
    ])
  })

  it("normalizes a tool_result block into tool_call_response", () => {
    const m = normalizeMessage({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu-1", content: "found 3" }],
    })
    expect(m?.parts[0]).toEqual({ type: "tool_call_response", id: "tu-1", response: "found 3" })
  })

  it("passes through already-normalized parts-shape messages", () => {
    const input = {
      role: "assistant",
      parts: [
        { type: "text", content: "hi" },
        { type: "tool_call", id: "x", name: "f", arguments: {} },
      ],
    }
    const m = normalizeMessage(input)
    expect(m).toEqual(input)
  })

  it("normalizes OpenAI assistant tool_calls alongside content", () => {
    const m = normalizeMessage({
      role: "assistant",
      content: "calling tool",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "search", arguments: '{"q":"x"}' },
        },
      ],
    })
    expect(m?.parts).toHaveLength(2)
    expect(m?.parts[0]).toEqual({ type: "text", content: "calling tool" })
    expect(m?.parts[1]).toEqual({ type: "tool_call", id: "call_1", name: "search", arguments: { q: "x" } })
  })

  it("normalizes OpenAI tool messages with tool_call_id", () => {
    const m = normalizeMessage({ role: "tool", tool_call_id: "call_1", content: "result" })
    expect(m?.parts[0]).toEqual({ type: "tool_call_response", id: "call_1", response: "result" })
  })

  it("coerces unknown roles to user", () => {
    const m = normalizeMessage({ role: "developer", content: "hi" })
    expect(m?.role).toBe("user")
  })

  it("normalizes thinking blocks into reasoning parts", () => {
    const m = normalizeMessage({
      role: "assistant",
      content: [{ type: "thinking", thinking: "let me think" }],
    })
    expect(m?.parts[0]).toEqual({ type: "reasoning", content: "let me think" })
  })

  it("normalizes image blocks with url source into uri parts", () => {
    const m = normalizeMessage({
      role: "user",
      content: [{ type: "image", source: { url: "https://example.com/x.png" } }],
    })
    expect(m?.parts[0]).toEqual({ type: "uri", modality: "image", uri: "https://example.com/x.png" })
  })

  it("returns undefined for non-objects", () => {
    expect(normalizeMessage(null)).toBeUndefined()
    expect(normalizeMessage("hello")).toBeUndefined()
    expect(normalizeMessage(42)).toBeUndefined()
  })

  it("falls back to JSON-stringified text part for unknown shapes", () => {
    const m = normalizeMessage({ role: "user", weird_field: { nested: "thing" } })
    expect(m?.role).toBe("user")
    expect(m?.parts).toHaveLength(1)
    expect(m?.parts[0]?.type).toBe("text")
    expect(typeof m?.parts[0]?.content).toBe("string")
  })
})

describe("normalizeMessages", () => {
  it("filters out non-objects", () => {
    const out = normalizeMessages([{ role: "user", content: "x" }, null, "skip"])
    expect(out).toHaveLength(1)
    expect(out[0]?.role).toBe("user")
  })
})

describe("assistantMessageFromOutput", () => {
  it("uses lastAssistant when present", () => {
    const m = assistantMessageFromOutput(["ignored"], { role: "assistant", content: "real output" })
    expect(m.parts[0]).toEqual({ type: "text", content: "real output" })
  })

  it("falls back to assistantTexts when lastAssistant is absent", () => {
    const m = assistantMessageFromOutput(["one", "two"], undefined)
    expect(m.role).toBe("assistant")
    expect(m.parts).toEqual([
      { type: "text", content: "one" },
      { type: "text", content: "two" },
    ])
  })

  it("forces role to assistant even if lastAssistant has a different role", () => {
    const m = assistantMessageFromOutput([], { role: "user", content: "weird" })
    expect(m.role).toBe("assistant")
  })

  it("never returns an empty parts array (returns one empty text part)", () => {
    const m = assistantMessageFromOutput([], undefined)
    expect(m.parts).toHaveLength(1)
  })
})

describe("userMessageFromPrompt + systemInstructionsParts", () => {
  it("wraps a user prompt", () => {
    expect(userMessageFromPrompt("hi")).toEqual({ role: "user", parts: [{ type: "text", content: "hi" }] })
  })

  it("wraps a system prompt as a single-element parts array", () => {
    expect(systemInstructionsParts("be helpful")).toEqual([{ type: "text", content: "be helpful" }])
  })
})

describe("OpenClaw / pi-ai transcript dialect", () => {
  it("normalizes assistant toolCall blocks into tool_call parts", () => {
    const msg = normalizeMessage({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "let me see" },
        { type: "text", text: "Running it" },
        { type: "toolCall", id: "t1", name: "exec", arguments: { command: "ls" } },
      ],
      usage: {},
      timestamp: 1,
    })
    expect(msg).toEqual({
      role: "assistant",
      parts: [
        { type: "reasoning", content: "let me see" },
        { type: "text", content: "Running it" },
        { type: "tool_call", id: "t1", name: "exec", arguments: { command: "ls" } },
      ],
    })
  })

  it("normalizes toolResult messages into tool_call_response parts with the tool name and error flag", () => {
    const msg = normalizeMessage({
      role: "toolResult",
      toolCallId: "t1",
      toolName: "exec",
      content: [
        { type: "text", text: "line 1" },
        { type: "text", text: "line 2" },
      ],
      isError: true,
      timestamp: 2,
    })
    expect(msg).toEqual({
      role: "tool",
      parts: [{ type: "tool_call_response", id: "t1", name: "exec", response: "line 1\nline 2", is_error: true }],
    })
  })

  it("unwraps the toolResult blocks the Codex harness nests inside a toolResult message", () => {
    const msg = normalizeMessage({
      role: "toolResult",
      toolCallId: "exec-1",
      toolName: "bash",
      content: [
        {
          type: "toolResult",
          id: "exec-1",
          name: "bash",
          toolCallId: "exec-1",
          content: "AGENTS.md\nSOUL.md",
          text: "AGENTS.md\nSOUL.md",
        },
      ],
      isError: false,
    })
    expect(msg?.parts[0]?.response).toBe("AGENTS.md\nSOUL.md")
  })

  it("keeps image blocks in a toolResult as parts", () => {
    const msg = normalizeMessage({
      role: "toolResult",
      toolCallId: "t1",
      toolName: "browser",
      content: [
        { type: "text", text: "shot" },
        { type: "image", data: "AAAA", mimeType: "image/png" },
      ],
      isError: false,
    })
    expect(msg?.parts[0]?.response).toEqual([
      { type: "text", content: "shot" },
      { type: "uri", modality: "image", uri: "data:image/png;base64,AAAA" },
    ])
  })

  it("normalizes user messages carrying base64 images", () => {
    const msg = normalizeMessage({
      role: "user",
      content: [
        { type: "text", text: "what is this" },
        { type: "image", data: "QUJD", mimeType: "image/jpeg" },
      ],
    })
    expect(msg?.parts).toEqual([
      { type: "text", content: "what is this" },
      { type: "uri", modality: "image", uri: "data:image/jpeg;base64,QUJD" },
    ])
  })

  it("renders redacted thinking as a placeholder and skips empty thinking", () => {
    const msg = normalizeMessage({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", redacted: true },
        { type: "thinking", thinking: "" },
        { type: "text", text: "hi" },
      ],
    })
    expect(msg?.parts).toEqual([
      { type: "reasoning", content: "[redacted]" },
      { type: "text", content: "hi" },
    ])
  })

  it("renders OpenClaw's injected runtime context as a system message", () => {
    const byFlag = normalizeMessage({
      role: "user",
      content: "Conversation info: {...}",
      runtimeContext: { kind: "turn" },
    })
    expect(byFlag?.role).toBe("system")
    const byPrefix = normalizeMessage({
      role: "user",
      content: [
        { type: "text", text: "[openclaw.runtime-context] <<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nConversation info" },
      ],
    })
    expect(byPrefix?.role).toBe("system")
    expect(normalizeMessage({ role: "user", content: "hello" })?.role).toBe("user")
  })

  it("turns custom runtime notes into a labelled user text part", () => {
    const msg = normalizeMessage({ role: "custom", customType: "failed-media", content: "image failed", timestamp: 3 })
    expect(msg).toEqual({ role: "user", parts: [{ type: "text", content: "[failed-media] image failed" }] })
  })
})
