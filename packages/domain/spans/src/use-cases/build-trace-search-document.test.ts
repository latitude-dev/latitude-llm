import { Effect } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import {
  TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS,
  TRACE_SEARCH_CHUNK_MAX_CHARS,
  TRACE_SEARCH_CHUNK_OVERLAP_CHARS,
  TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS,
  TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS,
  TRACE_SEARCH_DOCUMENT_MAX_LENGTH,
} from "../constants.ts"
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

  describe("chunks", () => {
    it("emits one chunk for a small conversation that packs into a single chunk", async () => {
      const document = await build([
        textMessage("user", "first user message"),
        textMessage("assistant", "first assistant response"),
      ])

      expect(document.chunks).toHaveLength(1)
      expect(document.chunks[0]?.chunkIndex).toBe(0)
      expect(document.chunks[0]?.text).toContain("first user message")
      expect(document.chunks[0]?.text).toContain("first assistant response")
      expect(document.chunks[0]?.contentHash).toMatch(/^[0-9a-f]+$/)
    })

    it("greedily packs many small turns up to the per-chunk cap", async () => {
      // Each turn ~600 chars. Per-chunk cap is 2000, so ~3 turns per chunk.
      const turn = "a".repeat(600)
      const messages: GenAIMessage[] = []
      for (let i = 0; i < 9; i++) {
        messages.push(textMessage("user", `${turn}-q${i}`))
        messages.push(textMessage("assistant", `${turn}-a${i}`))
      }

      const document = await build(messages)

      expect(document.chunks.length).toBeGreaterThan(1)
      for (const chunk of document.chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(TRACE_SEARCH_CHUNK_MAX_CHARS)
      }
      expect(document.chunks.map((c) => c.chunkIndex)).toEqual([...document.chunks.keys()])
    })

    it("splits a single turn larger than the per-chunk cap with overlap", async () => {
      const turn = "x".repeat(TRACE_SEARCH_CHUNK_MAX_CHARS * 3)
      const document = await build([textMessage("user", turn)])

      expect(document.chunks.length).toBeGreaterThanOrEqual(3)
      for (const chunk of document.chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(TRACE_SEARCH_CHUNK_MAX_CHARS)
      }
      const stride = TRACE_SEARCH_CHUNK_MAX_CHARS - TRACE_SEARCH_CHUNK_OVERLAP_CHARS
      expect(stride).toBe(1_800)
    })

    it("drops the middle when the conversation exceeds the per-trace budget (tail-first)", async () => {
      // 30 turns × ~1000 chars = ~30k chars. Tail walk takes ~12 turns (12k),
      // head walk takes ~8 turns (8k), middle ~10 turns dropped.
      const messages: GenAIMessage[] = []
      for (let i = 0; i < 30; i++) {
        messages.push(textMessage("user", `tag${i.toString().padStart(2, "0")} ${"u".repeat(900)}`))
        messages.push(textMessage("assistant", "ok"))
      }

      const document = await build(messages)
      const allChunkText = document.chunks.map((c) => c.text).join(" ")

      expect(allChunkText).toContain("tag29")
      expect(allChunkText).toContain("tag28")
      expect(allChunkText).toContain("tag00")
      expect(allChunkText).not.toContain("tag15")
    })

    it("does not duplicate turn 0 when the tail walk already consumed every turn", async () => {
      // A single huge turn is enough to exceed the document budget. The tail
      // walk already includes it via atomic-turn overshoot, so no separate
      // head guarantee is needed.
      const document = await build([
        textMessage("user", "first user opener"),
        textMessage("assistant", "y".repeat(TRACE_SEARCH_DOCUMENT_MAX_LENGTH * 2)),
      ])

      const allChunkText = document.chunks.map((c) => c.text).join(" ")
      expect(countOccurrences(allChunkText, "first user opener")).toBe(1)
      expect(document.chunks.length).toBeGreaterThan(1)
    })

    it("does not duplicate turns when head and tail walks meet", async () => {
      // Total is just over the trace budget while each turn is small enough to
      // avoid slicing. Tail and head selection should meet without repeating
      // the same turn in both regions.
      const messages: GenAIMessage[] = []
      for (let i = 0; i < 22; i++) {
        messages.push(textMessage("user", `marker-${i.toString().padStart(2, "0")} ${"x".repeat(900)}`))
        messages.push(textMessage("assistant", "ok"))
      }

      const document = await build(messages)
      const allChunkText = document.chunks.map((c) => c.text).join(" ")

      for (let i = 0; i < 22; i++) {
        const marker = `marker-${i.toString().padStart(2, "0")}`
        expect(countOccurrences(allChunkText, marker)).toBeLessThanOrEqual(1)
      }
    })

    it("respects budget allocation: ~12k tail + ~8k head", async () => {
      // 50 turns × ~1000 chars = ~50k chars total. Walks soft-cap at TAIL_BUDGET
      // and HEAD_BUDGET. Total embedded chars across chunks should land near
      // TAIL + HEAD with at most one boundary turn's worth of overshoot per side.
      const messages: GenAIMessage[] = []
      for (let i = 0; i < 50; i++) {
        messages.push(textMessage("user", "u".repeat(998)))
        messages.push(textMessage("assistant", "a"))
      }

      const document = await build(messages)
      const totalChars = document.chunks.reduce((sum, c) => sum + c.text.length, 0)
      const expected = TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS + TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS

      expect(totalChars).toBeGreaterThan(expected - 2_000)
      expect(totalChars).toBeLessThan(expected + 4_000)
    })

    it("keeps interleaved tool calls inside the same turn", async () => {
      const document = await build([
        textMessage("user", "search for X"),
        {
          role: "assistant",
          parts: [
            { type: "text", content: "let me check" },
            { type: "tool_call", id: "t1", name: "lookup", arguments: {} },
          ],
        } as GenAIMessage,
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "t1", response: "ignored" }],
        } as GenAIMessage,
        textMessage("assistant", "found it"),
        textMessage("user", "thanks"),
      ])

      const allText = document.chunks.map((c) => c.text).join("\n")
      expect(allText).toContain("search for X")
      expect(allText).toContain("let me check")
      expect(allText).toContain("[TOOL CALL: lookup]")
      expect(allText).toContain("found it")
      expect(allText).toContain("thanks")
    })

    it("emits no chunks for a conversation with no user / assistant content", async () => {
      const document = await build([textMessage("system", "system only — never indexed")])
      expect(document.chunks).toEqual([])
      expect(document.searchText).toBe("")
    })

    it("assigns stable chunk content hashes that vary by chunk index", async () => {
      const turn = "z".repeat(TRACE_SEARCH_CHUNK_MAX_CHARS * 2)
      const a = await build([textMessage("user", turn)])
      const b = await build([textMessage("user", turn)])

      expect(a.chunks.map((c) => c.contentHash)).toEqual(b.chunks.map((c) => c.contentHash))
      // Different chunk_index → different hash, even when underlying text
      // happens to overlap.
      const uniqueHashes = new Set(a.chunks.map((c) => c.contentHash))
      expect(uniqueHashes.size).toBe(a.chunks.length)
    })
  })
})

function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}
