import { Effect } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS, TRACE_SEARCH_DOCUMENT_MAX_LENGTH } from "../constants.ts"
import { buildTraceSearchDocument } from "./build-trace-search-document.ts"

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

    expect(document.searchText).toBe("look at this [IMAGE] [FILE:file-123] [TOOL CALL: lookup]")
    expect(document.searchText).not.toContain("not searchable")
  })

  it("excludes reasoning parts from the indexed text", async () => {
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

    expect(document.searchText).toBe("user question final answer")
    expect(document.searchText).not.toContain("secret chain of thought")
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
})
