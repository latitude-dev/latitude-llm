import { use, useMemo } from "react"
import { TextSelectionContext } from "../text-selection.tsx"
import { highlightAttributes, segmentForHighlights } from "./highlight-segments.ts"

export function JsonContent({
  content,
  messageIndex,
  partIndex,
}: {
  readonly content: string
  readonly messageIndex?: number | undefined
  readonly partIndex?: number | undefined
}) {
  const selectionCtx = use(TextSelectionContext)
  const highlights = useMemo(
    () =>
      messageIndex != null && partIndex != null
        ? (selectionCtx?.getHighlightsForBlock(messageIndex, partIndex) ?? [])
        : [],
    [selectionCtx, messageIndex, partIndex],
  )

  const segments = useMemo(() => {
    const sorted = [...highlights].sort((a, b) => a.startOffset - b.startOffset)
    return segmentForHighlights(content, 0, content.length, sorted)
  }, [content, highlights])

  return (
    <pre data-content-type="json" className="overflow-auto rounded-lg bg-muted p-3 text-xs">
      <code>
        {segments.map((segment, i) => {
          const attrs = highlightAttributes(segment.activeHighlight)
          return (
            <span
              // Segments are stable for a given (content, highlights) pair and
              // their index identifies position unambiguously.
              key={i}
              data-source-start={segment.sourceStart}
              data-source-end={segment.sourceEnd}
              {...attrs}
            >
              {segment.text}
            </span>
          )
        })}
      </code>
    </pre>
  )
}
