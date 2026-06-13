import {
  canonicalizeMessageForEmbedding,
  extractTraceSearchEmbeddingMessages,
  hashMessageContent,
  isTraceSearchSemanticMessage,
} from "@domain/spans"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { normalizeMessages } from "./normalization.ts"

describe("message embedding canonicalization", () => {
  it("produces identical canonical text and hashes for trace-search eligible conversation intelligence messages", async () => {
    const messages = [
      {
        role: "system",
        parts: [{ type: "text", content: "Answer in a concise tone." }],
      },
      {
        role: "user",
        parts: [
          { type: "text", content: "I need a refund for order A-1." },
          { type: "tool_call", name: "lookup_order" },
        ],
      },
      {
        role: "assistant",
        parts: [{ type: "text", content: "I can help with that refund." }],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", result: "Order A-1 is eligible." }],
      },
    ]

    const traceMessages = extractTraceSearchEmbeddingMessages(messages).filter(isTraceSearchSemanticMessage)
    const ciMessages = normalizeMessages(messages).filter(isTraceSearchSemanticMessage)

    expect(
      traceMessages.map((message) => canonicalizeMessageForEmbedding({ role: message.role, text: message.text })),
    ).toEqual(ciMessages.map((message) => canonicalizeMessageForEmbedding({ role: message.role, text: message.text })))

    const traceHashes = await Effect.runPromise(
      Effect.forEach(traceMessages, (message) => hashMessageContent({ role: message.role, text: message.text })),
    )
    const ciHashes = await Effect.runPromise(
      Effect.forEach(ciMessages, (message) => hashMessageContent({ role: message.role, text: message.text })),
    )

    expect(traceHashes).toEqual(ciHashes)
  })
})
