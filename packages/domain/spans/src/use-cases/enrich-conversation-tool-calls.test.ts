import { SpanId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { SpanMessagesData } from "../ports/span-repository.ts"
import { enrichConversationToolCalls } from "./enrich-conversation-tool-calls.ts"

function makeExecuteToolSpan(
  spanId: string,
  toolName: string,
  toolInput: string,
  toolOutput: string,
  toolCallId = "",
): SpanMessagesData {
  return {
    spanId: SpanId(spanId),
    operation: "execute_tool",
    toolCallId,
    toolName,
    toolInput,
    toolOutput,
    inputMessages: [],
    outputMessages: [],
  }
}

describe("enrichConversationToolCalls", () => {
  it("returns messages unchanged when spans are empty", () => {
    const messages = [{ role: "assistant" as const, parts: [{ type: "text" as const, content: "hi" }] }]
    expect(enrichConversationToolCalls(messages, [])).toEqual(messages)
  })

  it("fills missing tool_call arguments from span toolInput", () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [{ type: "tool_call" as const, id: "call-1", name: "codemode", arguments: {} }],
      },
    ]
    const spans = [makeExecuteToolSpan("span-1", "codemode", '{"code":"return 1"}', "", "call-1")]

    const enriched = enrichConversationToolCalls(messages, spans)
    expect(enriched[0]?.parts?.[0]).toMatchObject({
      type: "tool_call",
      arguments: { code: "return 1" },
    })
  })

  it("appends a synthetic tool response when span has toolOutput but conversation does not", () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [{ type: "tool_call" as const, id: "call-1", name: "codemode", arguments: { code: "x" } }],
      },
    ]
    const spans = [makeExecuteToolSpan("span-1", "codemode", '{"code":"x"}', '{"ok":true}', "call-1")]

    const enriched = enrichConversationToolCalls(messages, spans)
    expect(enriched).toHaveLength(2)
    expect(enriched[1]).toEqual({
      role: "tool",
      parts: [{ type: "tool_call_response", id: "call-1", response: { ok: true } }],
    })
  })

  it("does not duplicate tool responses already present in messages", () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [{ type: "tool_call" as const, id: "call-1", name: "codemode", arguments: { code: "x" } }],
      },
      {
        role: "tool" as const,
        parts: [{ type: "tool_call_response" as const, id: "call-1", response: "already here" }],
      },
    ]
    const spans = [makeExecuteToolSpan("span-1", "codemode", "{}", '{"ignored":true}', "call-1")]

    expect(enrichConversationToolCalls(messages, spans)).toHaveLength(2)
  })
})
