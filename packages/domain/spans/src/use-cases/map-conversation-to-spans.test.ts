import { SpanId } from "@domain/shared"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import type { SpanMessagesData } from "../ports/span-repository.ts"
import { buildConversationSpanMaps } from "./map-conversation-to-spans.ts"

function textMsg(role: "user" | "assistant", content: string): GenAIMessage {
  return { role, parts: [{ type: "text", content }] }
}

function makeSpan(
  spanId: string,
  output: GenAIMessage,
  inputs: readonly GenAIMessage[] = [],
  toolCallId = "",
): SpanMessagesData {
  return {
    spanId: SpanId(spanId),
    operation: "llm",
    toolCallId,
    inputMessages: inputs,
    outputMessages: [output],
  }
}

describe("buildConversationSpanMaps", () => {
  describe("messageSpanMap", () => {
    it("returns empty maps when there are no spans or messages", () => {
      const result = buildConversationSpanMaps([], [])
      expect(result.messageSpanMap).toEqual({})
      expect(result.toolCallSpanMap).toEqual({})
    })

    it("maps an assistant message index to the matching span", () => {
      const assistantMsg = textMsg("assistant", "Hello!")
      const span = makeSpan("span-1", assistantMsg)

      const messages: GenAIMessage[] = [textMsg("user", "Hi"), assistantMsg]
      const { messageSpanMap } = buildConversationSpanMaps(messages, [span])

      expect(messageSpanMap).toEqual({ 1: "span-1" })
    })

    it("does not map user messages", () => {
      const userMsg = textMsg("user", "What is 2+2?")
      const span = makeSpan("span-1", userMsg) // span with user message as output (unusual but tests the guard)

      const messages: GenAIMessage[] = [userMsg]
      const { messageSpanMap } = buildConversationSpanMaps(messages, [span])

      // user messages should never be attributed
      expect(messageSpanMap).toEqual({})
    })

    it("does not map messages with no matching span output", () => {
      const messages: GenAIMessage[] = [textMsg("assistant", "Unknown response")]
      const span = makeSpan("span-1", textMsg("assistant", "Different response"))

      const { messageSpanMap } = buildConversationSpanMaps(messages, [span])
      expect(messageSpanMap).toEqual({})
    })

    it("disambiguates duplicate output fingerprints by context score", () => {
      const sharedOutput = textMsg("assistant", "Same answer")

      const span1 = makeSpan("span-1", sharedOutput, [textMsg("user", "First question")])
      const span2 = makeSpan("span-2", sharedOutput, [textMsg("user", "Second question")])

      // First occurrence: preceded by "First question" → should match span1
      const messages1: GenAIMessage[] = [textMsg("user", "First question"), sharedOutput]
      const { messageSpanMap: map1 } = buildConversationSpanMaps(messages1, [span1, span2])
      expect(map1[1]).toBe("span-1")

      // Second occurrence: preceded by "Second question" → should match span2
      const messages2: GenAIMessage[] = [textMsg("user", "Second question"), sharedOutput]
      const { messageSpanMap: map2 } = buildConversationSpanMaps(messages2, [span1, span2])
      expect(map2[1]).toBe("span-2")
    })

    it("maps repeated identical assistant text to different spans when inputs differ (multi-turn chain)", () => {
      const ok = textMsg("assistant", "Ok")
      const msgA = textMsg("user", "A")
      const msgB = textMsg("user", "B")
      const msgC = textMsg("user", "C")
      const msgD = textMsg("user", "D")
      const msgE = textMsg("user", "E")
      const msgF = textMsg("user", "F")

      // Span 1: short context → first "Ok"
      const span1 = makeSpan("span-first", ok, [msgA, msgB])
      // Span 2: full prefix including first assistant reply → second "Ok"
      const span2 = makeSpan("span-second", ok, [msgA, msgB, ok, msgC, msgD])

      const allMessages: GenAIMessage[] = [msgA, msgB, ok, msgC, msgD, ok, msgE, msgF]
      const { messageSpanMap } = buildConversationSpanMaps(allMessages, [span1, span2])

      expect(messageSpanMap[2]).toBe("span-first")
      expect(messageSpanMap[5]).toBe("span-second")
    })

    it("fingerprints are case- and whitespace-insensitive for text parts", () => {
      const outputVariant = textMsg("assistant", "  HELLO  WORLD  ")
      const span = makeSpan("span-1", textMsg("assistant", "hello world"))

      const messages: GenAIMessage[] = [outputVariant]
      const { messageSpanMap } = buildConversationSpanMaps(messages, [span])
      expect(messageSpanMap[0]).toBe("span-1")
    })
  })

  describe("toolCallSpanMap", () => {
    it("maps toolCallId to spanId for spans with a toolCallId", () => {
      const span = makeSpan("span-tool", textMsg("assistant", "tool result"), [], "call-abc")
      const { toolCallSpanMap } = buildConversationSpanMaps([], [span])
      expect(toolCallSpanMap).toEqual({ "call-abc": "span-tool" })
    })

    it("ignores spans without a toolCallId", () => {
      const span = makeSpan("span-1", textMsg("assistant", "hi"), [], "")
      const { toolCallSpanMap } = buildConversationSpanMaps([], [span])
      expect(toolCallSpanMap).toEqual({})
    })

    it("maps multiple tool call spans independently", () => {
      const spanA = makeSpan("span-a", textMsg("assistant", "a"), [], "call-1")
      const spanB = makeSpan("span-b", textMsg("assistant", "b"), [], "call-2")
      const { toolCallSpanMap } = buildConversationSpanMaps([], [spanA, spanB])
      expect(toolCallSpanMap).toEqual({ "call-1": "span-a", "call-2": "span-b" })
    })
  })
})
