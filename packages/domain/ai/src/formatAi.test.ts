import type { GenAIPart } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import {
  formatGenAIConversation,
  formatGenAIMessage,
  formatGenAIMessagesForEnrichmentPrompt,
  formatGenAIPart,
} from "./formatAi.ts"

describe("formatGenAIPart", () => {
  it("formats text", () => {
    expect(formatGenAIPart({ type: "text", content: " hi " })).toBe(" hi ")
  })

  it("formats reasoning with fallback", () => {
    expect(formatGenAIPart({ type: "reasoning", content: "" })).toBe("Thought in private...")
    expect(formatGenAIPart({ type: "reasoning", content: "step 1" })).toBe("step 1")
  })

  it("formats uri when parseable", () => {
    expect(formatGenAIPart({ type: "uri", uri: "https://example.com/x", modality: "image" })).toBe(
      "https://example.com/x",
    )
  })

  it("formats tool_call and tool_call_response", () => {
    expect(
      formatGenAIPart({
        type: "tool_call",
        name: "search",
        arguments: { q: "a" },
      }),
    ).toBe(JSON.stringify({ id: null, name: "search", arguments: { q: "a" } }))
    expect(
      formatGenAIPart({
        type: "tool_call_response",
        response: { ok: true },
      }),
    ).toBe(JSON.stringify({ ok: true }))
  })

  it("formats redacted-reasoning via loose branch", () => {
    expect(formatGenAIPart({ type: "redacted-reasoning", data: "" } as GenAIPart)).toBe("Thought in private...")
    expect(formatGenAIPart({ type: "redacted-reasoning", data: "x" } as GenAIPart)).toBe("x")
  })
})

describe("formatGenAIMessage", () => {
  it("joins multiple parts", () => {
    expect(
      formatGenAIMessage({
        role: "user",
        parts: [
          { type: "text", content: "a" },
          { type: "text", content: "b" },
        ],
      }),
    ).toBe("a\nb")
  })
})

describe("formatGenAIConversation", () => {
  it("prefixes roles", () => {
    expect(
      formatGenAIConversation([
        { role: "user", parts: [{ type: "text", content: "Hi" }] },
        { role: "assistant", parts: [{ type: "text", content: "Hey" }] },
      ]),
    ).toBe("User: Hi\n\nAssistant: Hey")
  })
})

describe("formatGenAIMessagesForEnrichmentPrompt", () => {
  it("includes message indices and separators", () => {
    const out = formatGenAIMessagesForEnrichmentPrompt([
      { role: "user", parts: [{ type: "text", content: "u" }] },
      { role: "assistant", parts: [{ type: "text", content: "a" }] },
    ])
    expect(out).toContain("[message 0] role=user")
    expect(out).toContain("[message 1] role=assistant")
    expect(out).toContain("\n\n---\n\n")
  })
})
