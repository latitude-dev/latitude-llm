import { use, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkEmoji from "remark-emoji"
import remarkGfm from "remark-gfm"
import { TextSelectionContext } from "../text-selection.tsx"
import { sourceMappedTextPlugin } from "./source-mapped-text-plugin.ts"

const remarkPlugins = [remarkGfm, remarkEmoji, remarkBreaks] as const

export function MarkdownContent({
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

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none wrap-break-word">
      <ReactMarkdown remarkPlugins={[...remarkPlugins]} rehypePlugins={[sourceMappedTextPlugin(highlights)]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
