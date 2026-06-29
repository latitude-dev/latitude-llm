import type { TraceHighlight, TraceSearchHighlightsResult } from "@domain/spans"
import type { HighlightRange } from "@repo/ui"

export function getNavigableSearchHighlights(highlights: readonly TraceHighlight[]): readonly TraceHighlight[] {
  return highlights.filter(
    (highlight) =>
      (highlight.type === "search-literal" || highlight.type === "search-token") &&
      highlight.endOffset > highlight.startOffset,
  )
}

export function toSearchHighlightRanges(
  result: TraceSearchHighlightsResult | undefined,
  activeNavigableIndex: number | null,
): readonly HighlightRange[] {
  if (!result || result.highlights.length === 0) return []

  const navigable = getNavigableSearchHighlights(result.highlights)
  const active = activeNavigableIndex != null && activeNavigableIndex >= 0 ? navigable[activeNavigableIndex] : undefined

  return result.highlights.map((highlight) => ({
    messageIndex: highlight.messageIndex,
    partIndex: highlight.partIndex,
    startOffset: highlight.startOffset,
    endOffset: highlight.endOffset,
    type: highlight.type,
    ...(active &&
    highlight.messageIndex === active.messageIndex &&
    highlight.partIndex === active.partIndex &&
    highlight.startOffset === active.startOffset &&
    highlight.endOffset === active.endOffset &&
    highlight.type === active.type
      ? { searchActive: true }
      : {}),
  }))
}
