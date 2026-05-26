import { cn } from "../../../utils/cn.ts"
import type { HighlightRange } from "../text-selection.tsx"

interface HighlightSegment {
  sourceStart: number
  sourceEnd: number
  text: string
  activeHighlight: HighlightRange | null
}

function isSearchHighlight(h: HighlightRange): boolean {
  return h.type === "search-literal" || h.type === "search-token" || h.type === "search-semantic-region"
}

interface HighlightAttributes {
  className?: string
  "data-selected-text"?: true
  "data-annotated-text"?: true
  "data-annotation-id"?: string
  "data-search-match"?: "literal" | "token"
}

/**
 * Split a logical text span covering [sourceStart, sourceEnd) into segments at
 * highlight boundaries. Each segment reports its source offsets, its slice of
 * the underlying text, and the highlight that covers it (if any).
 *
 * Callers provide `highlights` pre-sorted by startOffset for deterministic
 * ordering; this function does not re-sort.
 */
export function segmentForHighlights(
  text: string,
  sourceStart: number,
  sourceEnd: number,
  highlights: readonly HighlightRange[],
): HighlightSegment[] {
  if (text.length === 0 || sourceEnd <= sourceStart) return []

  const overlaps = highlights.filter(
    (h) => h.endOffset > sourceStart && h.startOffset < sourceEnd && h.endOffset > h.startOffset,
  )

  if (overlaps.length === 0) {
    return [{ sourceStart, sourceEnd, text, activeHighlight: null }]
  }

  const cuts = new Set<number>([sourceStart, sourceEnd])
  for (const h of overlaps) {
    cuts.add(Math.max(sourceStart, h.startOffset))
    cuts.add(Math.min(sourceEnd, h.endOffset))
  }
  const boundaries = [...cuts].sort((a, b) => a - b)

  const segments: HighlightSegment[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const segStart = boundaries[i] ?? sourceStart
    const segEnd = boundaries[i + 1] ?? sourceEnd
    if (segEnd <= segStart) continue

    const sliceStart = segStart - sourceStart
    const sliceEnd = segEnd - sourceStart
    const segmentText = text.slice(sliceStart, sliceEnd)
    if (!segmentText) continue

    // Search wins on overlap so the matched span isn't obscured by annotation tint.
    const segmentMatches = overlaps.filter((h) => h.startOffset < segEnd && h.endOffset > segStart)
    const activeHighlight = segmentMatches.find(isSearchHighlight) ?? segmentMatches[0] ?? null

    segments.push({
      sourceStart: segStart,
      sourceEnd: segEnd,
      text: segmentText,
      activeHighlight,
    })
  }

  return segments
}

/**
 * Build the class + data attributes for a segment given its active highlight.
 * Shared between the rehype plugin and renderers that don't go through
 * ReactMarkdown.
 */
export function highlightAttributes(activeHighlight: HighlightRange | null): HighlightAttributes {
  if (!activeHighlight) return {}

  const isAnnotation = activeHighlight.type === "annotation"
  const isClickable = isAnnotation && !!activeHighlight.id
  const isSearchMatch = activeHighlight.type === "search-literal" || activeHighlight.type === "search-token"
  const className = cn({
    "cursor-pointer hit-area-inline-y-2": isClickable,
    "bg-yellow-100 border-b-2 border-yellow-300 dark:bg-yellow-400/20 dark:border-yellow-400/50":
      activeHighlight.type === "selection",
    "bg-red-100 dark:bg-red-400/30": isAnnotation && activeHighlight.passed === false,
    "bg-emerald-100 dark:bg-emerald-400/30": isAnnotation && activeHighlight.passed === true,
    "bg-blue-100 dark:bg-blue-400/30": isAnnotation && activeHighlight.passed === undefined,
    "bg-primary/30 dark:bg-primary/40": isSearchMatch,
    // mx-0.5 creates a parent-bg-colored gap between adjacent chips;
    // box-decoration-clone keeps the rounding per line on wrap.
    "rounded-sm box-decoration-clone mx-0.5": isAnnotation || isSearchMatch,
  })

  const attrs: HighlightAttributes = {}
  if (className) attrs.className = className
  if (activeHighlight.type === "selection") {
    attrs["data-selected-text"] = true
  } else if (isAnnotation) {
    attrs["data-annotated-text"] = true
    if (activeHighlight.id) attrs["data-annotation-id"] = activeHighlight.id
  } else if (activeHighlight.type === "search-literal") {
    attrs["data-search-match"] = "literal"
  } else if (activeHighlight.type === "search-token") {
    attrs["data-search-match"] = "token"
  }
  // "search-semantic-region" produces no inline attributes — it renders at the message-container level (PR5).
  return attrs
}
