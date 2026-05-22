import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import type { TraceSemanticHighlightMatch } from "../ports/trace-search-repository.ts"
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

  describe("semantic-region highlights", () => {
    const userAsst = (i: number) => [textMessage("user", `q${i}`), textMessage("assistant", `a${i}`)]
    const conversation = [...userAsst(0), ...userAsst(1), ...userAsst(2), ...userAsst(3)]

    function withMatch(match: TraceSemanticHighlightMatch) {
      return computeTraceSearchHighlights({
        messages: conversation,
        parsedQuery: parseSearchQuery("customer complaint"),
        semanticMatch: match,
      })
    }

    it("emits one block-level highlight per non-system message in the matched range", () => {
      // matched range: messages 2..5 (4 messages). All highlights share the
      // same source (chunkIndex + score), placeholder partIndex/startOffset/endOffset.
      const result = withMatch({
        chunkIndex: 3,
        firstMessageIndex: 2,
        lastMessageIndex: 5,
        relevanceScore: 0.84,
      })

      expect(result.highlights).toHaveLength(4)
      expect(result.highlights.map((h) => h.messageIndex)).toEqual([2, 3, 4, 5])
      for (const h of result.highlights) {
        expect(h.type).toBe("search-semantic-region")
        expect(h.partIndex).toBe(0)
        expect(h.startOffset).toBe(0)
        expect(h.endOffset).toBe(0)
        expect(h.source).toEqual({ kind: "semantic-region", chunkIndex: 3, score: 0.84 })
      }
    })

    it("skips role=system messages inside the matched range (visual tint may visually span them)", () => {
      // Insert a system message inside the matched range. The endpoint emits
      // no highlight for it; the renderer may visually span the tint across.
      const messages = [
        textMessage("user", "q0"),
        textMessage("system", "drifted-in system prompt"),
        textMessage("assistant", "a0"),
      ]
      const result = computeTraceSearchHighlights({
        messages,
        parsedQuery: parseSearchQuery("complaint"),
        semanticMatch: { chunkIndex: 0, firstMessageIndex: 0, lastMessageIndex: 2, relevanceScore: 0.7 },
      })
      expect(result.highlights.map((h) => h.messageIndex)).toEqual([0, 2])
    })

    it("skips emission when matched-range columns are NULL (pre-migration row)", () => {
      // ArgMax over a NULL column yields NULL. The endpoint treats that as
      // "no semantic-region data" and skips semantic-region; literal/token
      // (none here) would still flow.
      const result = withMatch({
        chunkIndex: 0,
        firstMessageIndex: null,
        lastMessageIndex: null,
        relevanceScore: 0.6,
      })
      expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
    })

    it("composes with literal hits — literal underlines render on top of the block tint", () => {
      const result = computeTraceSearchHighlights({
        messages: conversation,
        parsedQuery: parseSearchQuery('"q1"'),
        semanticMatch: { chunkIndex: 0, firstMessageIndex: 2, lastMessageIndex: 3, relevanceScore: 0.5 },
      })

      // 2 semantic-region highlights (messages 2 and 3) + 1 literal at index 2
      // (matching "q1" in message "q1"). messageIndex 0 has "q0" — no match.
      const semanticRegionHighlights = result.highlights.filter((h) => h.type === "search-semantic-region")
      const literalHighlights = result.highlights.filter((h) => h.type === "search-literal")
      expect(semanticRegionHighlights).toHaveLength(2)
      expect(literalHighlights).toHaveLength(1)
      expect(literalHighlights[0]!.messageIndex).toBe(2)
    })

    it("ignores semanticMatch when a phrase match-nothing makes the whole query empty", () => {
      // `---` tokenizes to []  ⇒ whole query is zero rows ⇒ no semantic-region
      // either, because the trace itself wouldn't appear in search results.
      const result = computeTraceSearchHighlights({
        messages: conversation,
        parsedQuery: parseSearchQuery("`---` customer complaint"),
        semanticMatch: { chunkIndex: 0, firstMessageIndex: 0, lastMessageIndex: 7, relevanceScore: 0.9 },
      })
      expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
    })

    it("returns empty when semanticMatch is null and there are no phrases (semantic-only with no match)", () => {
      const result = computeTraceSearchHighlights({
        messages: conversation,
        parsedQuery: parseSearchQuery("customer complaint"),
        semanticMatch: null,
      })
      expect(result).toEqual({ highlights: [], firstMatchIndex: -1 })
    })
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
