import type { TraceHighlight } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { getNavigableSearchHighlights, toSearchHighlightRanges } from "./navigable-search-highlights.ts"

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
})
