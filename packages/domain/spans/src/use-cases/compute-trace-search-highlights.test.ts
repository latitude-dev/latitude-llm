import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { computeTraceSearchHighlights } from "./compute-trace-search-highlights.ts"
import { parseSearchQuery } from "./parse-search-query.ts"

function textMessage(role: GenAIMessage["role"], content: string): GenAIMessage {
  return { role, parts: [{ type: "text", content }] }
}

function compute(messages: readonly GenAIMessage[], query: string) {
  return computeTraceSearchHighlights({
    messages,
    parsedQuery: parseSearchQuery(query),
  })
}

describe("computeTraceSearchHighlights", () => {
  it("returns empty result on empty query", () => {
    const result = compute([textMessage("user", "anything")], "")
    expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
  })

  it("returns empty when query has only a semantic prompt (no literal/token in PR 1)", () => {
    const result = compute([textMessage("user", "complaint about refunds")], "customer complaint")
    expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
  })

  it("emits one literal highlight per case-sensitive occurrence", () => {
    const content = "Refund the refund and refund again — REFUND not matched"
    const result = compute([textMessage("user", content)], '"refund"')

    expect(result.highlights).toHaveLength(2)
    expect(result.highlights.map((h) => [h.startOffset, h.endOffset])).toEqual([
      [11, 17],
      [22, 28],
    ])
    for (const h of result.highlights) {
      expect(h.type).toBe("search-literal")
      expect(h.source).toEqual({ kind: "literal", phrase: "refund" })
      expect(content.slice(h.startOffset, h.endOffset)).toBe("refund")
    }
    expect(result.firstMatchIndex).toBe(0)
  })

  it("emits token highlights with case- and punctuation-insensitive ordered adjacency", () => {
    const content = "Please Refund-Process the order; refund_process again."
    const result = compute([textMessage("user", content)], "`refund process`")

    expect(result.highlights).toHaveLength(2)
    for (const h of result.highlights) {
      expect(h.type).toBe("search-token")
      expect(h.source).toMatchObject({ kind: "token", phrase: "refund process", matchedTokens: ["refund", "process"] })
    }
    expect(content.slice(result.highlights[0]!.startOffset, result.highlights[0]!.endOffset)).toBe("Refund-Process")
    expect(content.slice(result.highlights[1]!.startOffset, result.highlights[1]!.endOffset)).toBe("refund_process")
  })

  it("skips role=system messages (they never reach the search index either)", () => {
    const result = compute(
      [
        textMessage("system", "the SECRET phrase appears here in the system prompt"),
        textMessage("user", "user says SECRET"),
      ],
      '"SECRET"',
    )

    expect(result.highlights).toHaveLength(1)
    expect(result.highlights[0]!.messageIndex).toBe(1)
  })

  it("emits hits across multiple parts of one message, preserving partIndex", () => {
    const result = compute(
      [
        {
          role: "user",
          parts: [
            { type: "text", content: "alpha BETA gamma" },
            { type: "blob", modality: "image", content: "ignored" },
            { type: "text", content: "BETA delta" },
          ],
        } as GenAIMessage,
      ],
      '"BETA"',
    )

    expect(result.highlights).toHaveLength(2)
    expect(result.highlights[0]).toMatchObject({ messageIndex: 0, partIndex: 0, startOffset: 6, endOffset: 10 })
    expect(result.highlights[1]).toMatchObject({ messageIndex: 0, partIndex: 2, startOffset: 0, endOffset: 4 })
  })

  it("combines literal + token hits in document order across messages", () => {
    const result = compute(
      [
        textMessage("user", "ask about a refund process today"),
        textMessage("assistant", 'gave them a "REFUND" yesterday'),
      ],
      '"REFUND" `refund process`',
    )

    expect(result.highlights).toHaveLength(2)
    expect(result.highlights[0]).toMatchObject({
      messageIndex: 0,
      type: "search-token",
      source: { kind: "token", phrase: "refund process" },
    })
    expect(result.highlights[1]).toMatchObject({
      messageIndex: 1,
      type: "search-literal",
      source: { kind: "literal", phrase: "REFUND" },
    })
    expect(result.firstMatchIndex).toBe(0)
  })

  it("ignores non-text parts (tool calls, blobs, reasoning)", () => {
    const result = compute(
      [
        {
          role: "assistant",
          parts: [
            { type: "tool_call", id: "t1", name: "refund_lookup", arguments: {} },
            { type: "blob", modality: "image", content: "refund.png" },
            { type: "reasoning", content: "should I refund" },
          ],
        } as GenAIMessage,
      ],
      '"refund"',
    )

    expect(result.highlights).toEqual([])
  })

  it("returns empty when any token phrase tokenizes to nothing (all-punctuation phrase)", () => {
    // Match-nothing parity with `buildLexicalSearchSubquery`: a tokens-to-nothing
    // phrase makes the whole query zero rows, not just "skip this phrase".
    const result = compute([textMessage("user", "hello world")], "`---`")
    expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
  })

  it("returns empty when ANY phrase matches nothing, even if other phrases would match", () => {
    // Mixed query: `---` tokenizes to []  ⇒ the whole query matches zero rows
    // in ClickHouse, so the literal "hello" must also produce zero highlights.
    const result = compute([textMessage("user", "hello world")], '`---` "hello"')
    expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
  })

  it("returns empty when a literal phrase normalizes to nothing (whitespace-only)", () => {
    // `"   "` trims to ""  ⇒ same match-nothing semantics as ClickHouse.
    const result = compute([textMessage("user", "hello world")], '"   " "hello"')
    expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
  })

  it("matches literal phrases across whitespace runs (newline / multi-space), mirroring index normalization", () => {
    // The lexical indexer normalizes both sides (trim + collapse whitespace) before
    // LIKE, so `"refund process"` should match `refund\nprocess` and `refund  process`
    // in the raw text. Without this the index could match a trace the drawer can't
    // visually explain.
    const content = "first hit: refund process. second: refund\nprocess. third: refund  process. miss: refundprocess"
    const result = compute([textMessage("user", content)], '"refund process"')

    expect(result.highlights).toHaveLength(3)
    expect(result.highlights.map((h) => content.slice(h.startOffset, h.endOffset))).toEqual([
      "refund process",
      "refund\nprocess",
      "refund  process",
    ])
  })

  it("does not throw on malformed messages with undefined `parts`", () => {
    // The type says `parts` is always present, but a legacy ingest path can
    // emit a row without it. Skip rather than throw.
    const result = compute(
      [{ role: "user" } as unknown as GenAIMessage, textMessage("user", "refund here")],
      '"refund"',
    )
    expect(result.highlights).toHaveLength(1)
    expect(result.highlights[0]).toMatchObject({ messageIndex: 1, startOffset: 0, endOffset: 6 })
  })

  it("preserves overlapping literal + token ranges (renderer decides stacking)", () => {
    // `"refund" `refund process`` emits both the literal [0,6] and the token
    // [0,14] at the same source text. Both carry distinct `source` info that
    // the popover needs; dedup would lose information.
    const result = compute([textMessage("user", "refund process is slow")], '"refund" `refund process`')
    expect(result.highlights).toHaveLength(2)
    expect(result.highlights.map((h) => [h.type, h.startOffset, h.endOffset])).toEqual([
      ["search-literal", 0, 6],
      ["search-token", 0, 14],
    ])
  })

  it("normalizes the literal phrase the same way the indexer does (multi-space → single space)", () => {
    // User types two spaces, ClickHouse collapses to one. Highlight must still
    // land on the raw single-space occurrence in the content.
    const content = "the refund process succeeded"
    const result = compute([textMessage("user", content)], '"refund  process"')

    expect(result.highlights).toHaveLength(1)
    expect(content.slice(result.highlights[0]!.startOffset, result.highlights[0]!.endOffset)).toBe("refund process")
  })
})
