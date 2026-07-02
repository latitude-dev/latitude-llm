import type { TraceHighlight, TraceSearchHighlightsResult } from "@domain/spans"
import type { FirstMatchHint, HighlightRange } from "@repo/ui"

export type SearchScrollTarget =
  | { readonly kind: "inline"; readonly messageIndex: number; readonly startOffset: number }
  | { readonly kind: "message"; readonly messageIndex: number }

export function getNavigableSearchHighlights(highlights: readonly TraceHighlight[]): readonly TraceHighlight[] {
  return highlights.filter(isInlineNavigableHighlight)
}

function isInlineNavigableHighlight(highlight: TraceHighlight): boolean {
  return (
    (highlight.type === "search-literal" || highlight.type === "search-token") &&
    highlight.endOffset > highlight.startOffset
  )
}

function getFirstOrderedHighlight(result: TraceSearchHighlightsResult): TraceHighlight | null {
  if (result.highlights.length === 0) return null
  const index = result.firstMatchIndex >= 0 ? result.firstMatchIndex : 0
  return result.highlights[index] ?? result.highlights[0] ?? null
}

export function getSearchScrollTarget(highlight: TraceHighlight): SearchScrollTarget {
  if (isInlineNavigableHighlight(highlight)) {
    return {
      kind: "inline",
      messageIndex: highlight.messageIndex,
      startOffset: highlight.startOffset,
    }
  }
  return { kind: "message", messageIndex: highlight.messageIndex }
}

export function getFirstMatchHint(result: TraceSearchHighlightsResult | undefined): FirstMatchHint | null {
  if (!result) return null
  const first = getFirstOrderedHighlight(result)
  if (!first) return null
  return { messageIndex: first.messageIndex, partIndex: first.partIndex }
}

export function resolveSearchScrollTarget(args: {
  readonly result: TraceSearchHighlightsResult | undefined
  readonly navigableMatches: readonly TraceHighlight[]
  readonly activeNavigableIndex: number
}): SearchScrollTarget | null {
  const { result, navigableMatches, activeNavigableIndex } = args
  if (!result || result.highlights.length === 0) return null

  const activeNavigable = navigableMatches[activeNavigableIndex]
  if (activeNavigable) return getSearchScrollTarget(activeNavigable)

  const first = getFirstOrderedHighlight(result)
  if (!first) return null
  return getSearchScrollTarget(first)
}

export function toSearchHighlightRanges(
  result: TraceSearchHighlightsResult | undefined,
  activeNavigableIndex: number | null,
): readonly HighlightRange[] {
  if (!result || result.highlights.length === 0) return []

  let navigableIdx = 0
  return result.highlights.map((highlight) => {
    const isNavigable = isInlineNavigableHighlight(highlight)

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
