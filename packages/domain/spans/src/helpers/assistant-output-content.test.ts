import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { assistantMessageHasOutputContent, hasUsableAssistantCompletion } from "./assistant-output-content.ts"

const message = (role: GenAIMessage["role"], parts: unknown[]): GenAIMessage => ({ role, parts }) as GenAIMessage

describe("assistantMessageHasOutputContent", () => {
  it("accepts non-whitespace text and tool calls", () => {
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "text", content: "done" }]))).toBe(true)
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "tool_call", name: "search" }]))).toBe(true)
  })

  it("rejects blank text, reasoning-only output, and non-assistant messages", () => {
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "text", content: "  " }]))).toBe(false)
    expect(assistantMessageHasOutputContent(message("assistant", [{ type: "reasoning", content: "thinking" }]))).toBe(
      false,
    )
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
})
