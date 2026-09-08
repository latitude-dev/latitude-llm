import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { assistantMessageHasOutputContent, hasUsableAssistantCompletion } from "./assistant-output-content.ts"

const message = (role: GenAIMessage["role"], parts: unknown[]): GenAIMessage => ({ role, parts }) as GenAIMessage

describe("assistantMessageHasOutputContent", () => {
  it("accepts non-whitespace response text", () => {
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "text", content: "done" }]))).toBe(true)
  })

  it("accepts a tool-call-only response", () => {
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "tool_call", name: "search" }]))).toBe(true)
  })

  it("accepts a malformed tool call as delivered content", () => {
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "tool_call" }]))).toBe(true)
  })

  it("rejects blank response text", () => {
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "text", content: "  " }]))).toBe(false)
  })

  it("rejects reasoning-only output", () => {
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "reasoning", content: "thinking" }]))).toBe(
      false,
    )
  })

  it("rejects non-assistant messages", () => {
    expect(assistantMessageHasOutputContent(message("user", [{ type: "text", content: "hello" }]))).toBe(false)
  })
})

describe("hasUsableAssistantCompletion", () => {
  it("uses the final captured assistant turn", () => {
    expect(
      hasUsableAssistantCompletion([
        message("assistant", [{ type: "text", content: "earlier" }]),
        message("tool", [{ type: "tool_call_response", response: "ok" }]),
        message("assistant", [{ type: "reasoning", content: "unfinished" }]),
      ]),
    ).toBe(false)
  })

  it("is false when no assistant turn was captured", () => {
    expect(hasUsableAssistantCompletion([message("user", [{ type: "text", content: "hello" }])])).toBe(false)
  })

  it("uses the same text-or-tool-call rule for the final captured turn", () => {
    expect(hasUsableAssistantCompletion([message("assistant", [{ type: "text", content: "answer" }])])).toBe(true)
    expect(hasUsableAssistantCompletion([message("assistant", [{ type: "tool_call" }])])).toBe(true)
    expect(hasUsableAssistantCompletion([message("assistant", [{ type: "text", content: "\n" }])])).toBe(false)
  })
})
