import { use, useMemo } from "react"
import { cn } from "../../../utils/cn.ts"
import { CodeBlockControls } from "../../code-block/code-block-controls.tsx"
import { TextSelectionContext } from "../text-selection.tsx"
import { CodeBlockShell } from "./code-block-shell.tsx"
import { highlightAttributes, segmentForHighlights } from "./highlight-segments.ts"
import { flattenHighlightedTokens, lowlight } from "./syntax-highlight.ts"

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

  // Tokenize once per content change. lowlight produces a HAST tree where
  // concatenating every leaf text value reproduces the original source — so
  // the flattened tokens preserve JsonContent's 1:1 source-to-DOM invariant.
  const tokens = useMemo(() => {
    const tree = lowlight.highlight("json", content)
    return flattenHighlightedTokens(tree, 0)
  }, [content])

  // Sub-segment each syntax token against annotation highlights so a single
  // highlight that straddles two tokens still renders correctly.
  const segments = useMemo(() => {
    const sorted = [...highlights].sort((a, b) => a.startOffset - b.startOffset)
    return tokens.flatMap((token) =>
      segmentForHighlights(token.text, token.sourceStart, token.sourceEnd, sorted).map((seg) => ({
        ...seg,
        hljsClass: token.hljsClass,
      })),
    )
  }, [tokens, highlights])

  return (
    <CodeBlockShell contentType="json" controls={<CodeBlockControls content={content} language="json" />}>
      <code>
        {segments.map((segment, i) => {
          const { className: highlightClass, ...attrs } = highlightAttributes(segment.activeHighlight)
          const className = cn(segment.hljsClass, highlightClass) || undefined
          return (
            <span
              // Segments are stable for a given (content, highlights) pair and
              // their index identifies position unambiguously.
              key={i}
              data-source-start={segment.sourceStart}
              data-source-end={segment.sourceEnd}
              {...attrs}
              {...(className ? { className } : {})}
            >
              {segment.text}
            </span>
          )
        })}
      </code>
    </CodeBlockShell>
  )
}
