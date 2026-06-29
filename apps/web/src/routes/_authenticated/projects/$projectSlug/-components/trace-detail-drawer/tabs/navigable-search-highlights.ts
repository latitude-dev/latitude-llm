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

  let navigableIdx = 0
  return result.highlights.map((highlight) => {
    const isNavigable =
      (highlight.type === "search-literal" || highlight.type === "search-token") &&
      highlight.endOffset > highlight.startOffset

    const range: HighlightRange = {
      messageIndex: highlight.messageIndex,
      partIndex: highlight.partIndex,
      startOffset: highlight.startOffset,
      endOffset: highlight.endOffset,
      type: highlight.type,
    }

    if (!isNavigable) return range

    const isActive = activeNavigableIndex != null && activeNavigableIndex >= 0 && navigableIdx === activeNavigableIndex
    navigableIdx++
    return isActive ? { ...range, searchActive: true } : range
  })
}
