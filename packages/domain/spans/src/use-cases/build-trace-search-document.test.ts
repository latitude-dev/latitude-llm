import { Effect } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS, TRACE_SEARCH_DOCUMENT_MAX_LENGTH } from "../constants.ts"
import { buildTraceSearchDocument, extractTraceSearchEmbeddingMessages } from "./build-trace-search-document.ts"

const startTime = new Date("2026-01-01T00:00:00.000Z")

function textMessage(role: GenAIMessage["role"], content: string): GenAIMessage {
  return { role, parts: [{ type: "text", content }] }
}

function build(messages: readonly GenAIMessage[]) {
  return Effect.runPromise(
    buildTraceSearchDocument({
      traceId: "trace-id",
      startTime,
      rootSpanName: "root span name",
      messages,
    }),
  )
}

describe("buildTraceSearchDocument", () => {
  it("builds conversation-only text in canonical message order", async () => {
    const document = await build([
      textMessage("system", "system prompt should not be indexed"),
      textMessage("user", "first user message"),
      textMessage("assistant", "first assistant response"),
      textMessage("user", "second user message"),
      textMessage("assistant", "second assistant response"),
    ])

    expect(document.searchText).toBe(
      "first user message first assistant response second user message second assistant response",
    )
    expect(document.searchText).not.toContain("system prompt")
    expect(document.searchText).not.toContain("root span name")
  })

  it("formats searchable non-text parts without including unsupported response noise", async () => {
    const document = await build([
      {
        role: "user",
        parts: [
          { type: "text", content: "look at this" },
          { type: "blob", modality: "image", content: "ignored" },
          { type: "file", file_id: "file-123", modality: "document" },
          { type: "tool_call", id: "tool-123", name: "lookup", arguments: {} },
          { type: "tool_call_response", id: "tool-123", response: "not searchable" },
        ],
      } as GenAIMessage,
    ])

    expect(document.searchText).toContain("look at this")
    expect(document.searchText).toContain("[IMAGE]")
    expect(document.searchText).toContain("[FILE:file-123]")
    expect(document.searchText).toContain("[TOOL CALL: lookup]")
    expect(document.searchText).toContain("not searchable")
  })

  it("includes reasoning text in the lexical index", async () => {
    const document = await build([
      textMessage("user", "user question"),
      {
        role: "assistant",
        parts: [
          { type: "reasoning", content: "secret chain of thought tokens" },
          { type: "text", content: "final answer" },
        ],
      } as GenAIMessage,
    ])

    expect(document.searchText).toContain("user question")
    expect(document.searchText).toContain("final answer")
    expect(document.searchText).toContain("secret chain of thought")
  })

  it("skips reasoning text from message-level embeddings", () => {
    const messages = extractTraceSearchEmbeddingMessages([
      textMessage("user", "user question"),
      {
        role: "assistant",
        parts: [
          { type: "reasoning", content: "secret chain of thought tokens" },
          { type: "text", content: "final answer" },
        ],
      } as GenAIMessage,
    ])

    expect(messages).toEqual([
      { index: 0, role: "user", text: "user question" },
      { index: 1, role: "assistant", text: "final answer" },
    ])
  })

  it("stringifies object-shaped tool_call_response payloads for the lexical index", async () => {
    const document = await build([
      textMessage("user", "trigger the lookup"),
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "tc-1", name: "lookup", arguments: {} }],
      } as GenAIMessage,
      {
        role: "tool",
        parts: [
          {
            type: "tool_call_response",
            id: "tc-1",
            response: { status: "ok", ticket: "RFD-2026-0512-0042", amountUsd: 42.3 },
          },
        ],
      } as GenAIMessage,
      textMessage("assistant", "ticket created"),
    ])

    expect(document.searchText).toContain("RFD-2026-0512-0042")
    expect(document.searchText).toContain("status")
    expect(document.searchText).toContain("ok")
  })

  it("keeps the beginning and end when the conversation exceeds the cap", async () => {
    const head = "h".repeat(TRACE_SEARCH_DOCUMENT_MAX_LENGTH / 2)
    const middle = "m".repeat(1_000)
    const tail = "t".repeat(TRACE_SEARCH_DOCUMENT_MAX_LENGTH / 2)

    const document = await build([textMessage("user", `${head}${middle}${tail}`)])

    expect(TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS).toBe(5_000)
    expect(document.searchText).toHaveLength(TRACE_SEARCH_DOCUMENT_MAX_LENGTH)
    expect(document.searchText).toContain("[... trace search omitted middle ...]")
    expect(document.searchText.startsWith("h".repeat(100))).toBe(true)
    expect(document.searchText.endsWith("t".repeat(100))).toBe(true)
    expect(document.searchText).not.toContain("m".repeat(100))
  })

  it("replaces unpaired UTF-16 surrogates so ClickHouse JSON insert is safe", async () => {
    // Lone high surrogate (\uD83D) and lone low surrogate (\uDE00) inside text.
    // Without sanitization these would propagate into the JSONEachRow payload
    // and ClickHouse rejects them with "missing second part of surrogate pair".
    const document = await build([textMessage("user", "before \uD83D middle \uDE00 after")])

    expect(hasLoneSurrogate(document.searchText)).toBe(false)
    expect(document.searchText).toContain("before")
    expect(document.searchText).toContain("after")
  })

  it("does not leave a lone surrogate when truncation splits a surrogate pair", async () => {
    // Each "😀" is a surrogate pair (\uD83D\uDE00 — two UTF-16 code units).
    // The truncateMiddle head/tail slices land on odd offsets given the
    // marker length, so an emoji-only input forces both cuts to fall mid-pair.
    const oversized = "😀".repeat(TRACE_SEARCH_DOCUMENT_MAX_LENGTH)
    const document = await build([textMessage("user", oversized)])

    expect(document.searchText.length).toBeLessThanOrEqual(TRACE_SEARCH_DOCUMENT_MAX_LENGTH)
    expect(hasLoneSurrogate(document.searchText)).toBe(false)
  })

  it("returns empty lexical text for system-only conversations", async () => {
    const document = await build([textMessage("system", "system only")])

    expect(document.searchText).toBe("")
  })

  it("skips messages with missing parts instead of throwing", async () => {
    const document = await build([
      textMessage("user", "before gap"),
      { role: "assistant" } as GenAIMessage,
      textMessage("user", "after gap"),
    ])

    expect(document.searchText).toBe("before gap after gap")
  })
})

function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)
}
