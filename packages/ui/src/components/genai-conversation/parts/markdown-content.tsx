import { use, useMemo, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkBreaks from "remark-breaks"
import remarkEmoji from "remark-emoji"
import remarkGfm from "remark-gfm"
import { Button } from "../../button/button.tsx"
import { Text } from "../../text/text.tsx"
import { TextSelectionContext } from "../text-selection.tsx"
import { CodeBlockShell } from "./code-block-shell.tsx"
import { JsonContent } from "./json-content.tsx"
import { sourceMappedTextPlugin } from "./source-mapped-text-plugin.ts"

const remarkPlugins = [remarkGfm, remarkEmoji, remarkBreaks] as const

// `rehype-highlight` only tokenizes `<code>` elements that carry a
// `language-*` class (i.e. fences with an explicit language); it leaves
// prose and unknown-language fences untouched. `sourceMappedTextPlugin`
// still runs afterwards on non-code text — code-fence text has no source
// position to begin with (remark-to-hast limitation), so highlighting it
// doesn't change annotation behavior there.
//
// Typed as a mutable tuple because react-markdown's `PluggableList` rejects
// `readonly` tuples (no covariance through `as const`).
const rehypeHighlightPlugin: [typeof rehypeHighlight, { detect: false }] = [rehypeHighlight, { detect: false }]

// Route Markdown code fences through the same shell as JsonContent so whole-
// part JSON and inline ```...``` blocks share one visual treatment.
const markdownComponents: Components = {
  pre: ({ children }) => <CodeBlockShell>{children}</CodeBlockShell>,
}
export const LARGE_MARKDOWN_CONTENT_THRESHOLD = 20_000
export const LARGE_MARKDOWN_PREVIEW_LENGTH = 12_000

function getLargeContentPreview(content: string) {
  if (content.length <= LARGE_MARKDOWN_PREVIEW_LENGTH) return content

  return `${content.slice(0, LARGE_MARKDOWN_PREVIEW_LENGTH)}\n\n[truncated ${content.length - LARGE_MARKDOWN_PREVIEW_LENGTH} characters]`
}

export function isJsonBlock(content: string): boolean {
  const t = content.trim()
  if (t.length < 2) return false
  const first = t[0]
  const last = t[t.length - 1]
  if (!((first === "{" && last === "}") || (first === "[" && last === "]"))) return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

// Reformat compact (single-line) JSON so nested structures render with
// indentation. Already-multiline JSON is kept verbatim so any producer-side
// formatting (and annotation offsets saved against it) is preserved.
function prettifyCompactJson(content: string): string {
  if (content.includes("\n")) return content
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

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
  const [showFullText, setShowFullText] = useState(false)
  // Gate the JSON.parse on size so oversized content doesn't pay the parse cost
  // only to be discarded by the large-content fallback below.
  const isJson = useMemo(() => content.length <= LARGE_MARKDOWN_CONTENT_THRESHOLD && isJsonBlock(content), [content])

  if (content.length > LARGE_MARKDOWN_CONTENT_THRESHOLD) {
    const preview = showFullText ? content : getLargeContentPreview(content)

    return (
      <div className="flex flex-col gap-3">
        <Text.H6 color="foregroundMuted">
          This content is too large to render as Markdown safely, so we&apos;re showing it as plain text instead.
        </Text.H6>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => setShowFullText((prev) => !prev)}>
            {showFullText ? "Show preview" : "Show full text"}
          </Button>
        </div>

        <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs">
          {preview}
        </pre>
      </div>
    )
  }

  if (isJson) {
    return <JsonContent content={prettifyCompactJson(content)} messageIndex={messageIndex} partIndex={partIndex} />
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none wrap-break-word">
      <ReactMarkdown
        remarkPlugins={[...remarkPlugins]}
        rehypePlugins={[rehypeHighlightPlugin, sourceMappedTextPlugin(highlights)]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
