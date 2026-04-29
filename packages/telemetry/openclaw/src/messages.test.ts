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
