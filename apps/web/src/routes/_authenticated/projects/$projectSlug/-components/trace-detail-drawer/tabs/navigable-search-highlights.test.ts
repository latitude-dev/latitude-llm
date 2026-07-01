import type { TraceHighlight } from "@domain/spans"
import { describe, expect, it } from "vitest"
import {
  getFirstMatchHint,
  getNavigableSearchHighlights,
  getSearchScrollTarget,
  resolveSearchScrollTarget,
  toSearchHighlightRanges,
} from "./navigable-search-highlights.ts"

function highlight(overrides: Partial<TraceHighlight> & Pick<TraceHighlight, "type">): TraceHighlight {
  return {
    messageIndex: 0,
    partIndex: 0,
    startOffset: 0,
    endOffset: 5,
    source: { kind: "literal", phrase: "test" },
    ...overrides,
  }
}

describe("getNavigableSearchHighlights", () => {
  it("keeps inline literal and token hits only", () => {
    const highlights = [
      highlight({ type: "search-literal" }),
      highlight({ type: "search-token", startOffset: 10, endOffset: 15 }),
      highlight({ type: "search-container", startOffset: 0, endOffset: 0 }),
      highlight({ type: "search-semantic-region", startOffset: 0, endOffset: 0 }),
    ]

    expect(getNavigableSearchHighlights(highlights)).toHaveLength(2)
  })
})

describe("toSearchHighlightRanges", () => {
  it("marks the active navigable match", () => {
    const highlights = [
      highlight({ type: "search-literal", startOffset: 0, endOffset: 4 }),
      highlight({ type: "search-literal", startOffset: 10, endOffset: 14 }),
    ]

    const ranges = toSearchHighlightRanges({ highlights, firstMatchIndex: 0 }, 1)

    expect(ranges[0]?.searchActive).toBeUndefined()
    expect(ranges[1]?.searchActive).toBe(true)
  })

  it("marks the second identical navigable match active by index", () => {
    const highlights = [
      highlight({ type: "search-literal", startOffset: 0, endOffset: 4 }),
      highlight({ type: "search-literal", startOffset: 0, endOffset: 4 }),
    ]

    const ranges = toSearchHighlightRanges({ highlights, firstMatchIndex: 0 }, 1)

    expect(ranges[0]?.searchActive).toBeUndefined()
    expect(ranges[1]?.searchActive).toBe(true)
  })
})

describe("getFirstMatchHint", () => {
  it("returns the first highlight including semantic regions", () => {
    const highlights = [
      highlight({ type: "search-semantic-region", startOffset: 0, endOffset: 0, messageIndex: 12, partIndex: 0 }),
      highlight({ type: "search-literal", messageIndex: 12, startOffset: 4, endOffset: 10 }),
    ]

    expect(getFirstMatchHint({ highlights, firstMatchIndex: 0 })).toEqual({
      messageIndex: 12,
      partIndex: 0,
    })
  })
})

describe("resolveSearchScrollTarget", () => {
  it("scrolls to the active navigable match when one exists", () => {
    const highlights = [
      highlight({ type: "search-semantic-region", startOffset: 0, endOffset: 0, messageIndex: 5 }),
      highlight({ type: "search-literal", messageIndex: 5, startOffset: 10, endOffset: 16 }),
    ]

    expect(
      resolveSearchScrollTarget({
        result: { highlights, firstMatchIndex: 0 },
        navigableMatches: getNavigableSearchHighlights(highlights),
        activeNavigableIndex: 0,
      }),
    ).toEqual({ kind: "inline", messageIndex: 5, startOffset: 10 })
  })

  it("falls back to the first semantic region when there are no navigable matches", () => {
    const highlights = [
      highlight({ type: "search-semantic-region", startOffset: 0, endOffset: 0, messageIndex: 18, partIndex: 0 }),
    ]

    expect(
      resolveSearchScrollTarget({
        result: { highlights, firstMatchIndex: 0 },
        navigableMatches: [],
        activeNavigableIndex: 0,
      }),
    ).toEqual({ kind: "message", messageIndex: 18 })
  })
})

describe("getSearchScrollTarget", () => {
  it("maps semantic regions to message anchors", () => {
    expect(
      getSearchScrollTarget(
        highlight({ type: "search-semantic-region", startOffset: 0, endOffset: 0, messageIndex: 7 }),
      ),
    ).toEqual({ kind: "message", messageIndex: 7 })
  })
})
