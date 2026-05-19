import { isJsonBlock, LARGE_MARKDOWN_CONTENT_THRESHOLD, prettifyCompactJson } from "@repo/utils"
import { isValidElement, type ReactNode, use, useMemo, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkBreaks from "remark-breaks"
import remarkEmoji from "remark-emoji"
import remarkGfm from "remark-gfm"
import { CodeBlockControls } from "../../code-block/code-block-controls.tsx"
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

// rehype-highlight rewrites the text inside a code fence into nested
// `<span>`s, so the original source string isn't a single child anymore. Walk
// the React tree to recover it for copy/expand controls.
function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode }
    return extractText(props.children)
  }
  return ""
}

function extractCodeFenceLanguage(node: ReactNode): string | undefined {
  if (!isValidElement(node)) return undefined
  const className = (node.props as { className?: string }).className ?? ""
  const match = /language-(\w+)/.exec(className)
  return match?.[1]
}

// Route Markdown code fences through the same shell as JsonContent so whole-
// part JSON and inline ```...``` blocks share one visual treatment.
const markdownComponents: Components = {
  pre: ({ children }) => {
    const content = extractText(children)
    const language = extractCodeFenceLanguage(children)
    return (
      <CodeBlockShell controls={<CodeBlockControls content={content} {...(language ? { language } : {})} />}>
        {children}
      </CodeBlockShell>
    )
  },
  // Wide tables would otherwise push their parent past the drawer width;
  // wrap them so overflow scrolls horizontally inside the message.
  table: ({ children }) => (
    <div className="max-w-full overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
}
export const LARGE_MARKDOWN_HEAD_LENGTH = 6_000
export const LARGE_MARKDOWN_TAIL_LENGTH = 2_000

// Snap to the nearest newline within a small radius so we don't cut markdown
// constructs (lists, fences, headings) mid-syntax on the first/last slice.
function snapToNewline(content: string, target: number, radius = 400): number {
  const start = Math.max(0, target - radius)
  const end = Math.min(content.length, target + radius)
  const window = content.slice(start, end)
  const localTarget = target - start
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < window.length; i++) {
    if (window[i] !== "\n") continue
    const dist = Math.abs(i - localTarget)
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best === -1 ? target : start + best
}

function splitLargeContent(content: string): { head: string; middle: string; tail: string } {
  const headCut = snapToNewline(content, LARGE_MARKDOWN_HEAD_LENGTH)
  const tailCut = snapToNewline(content, content.length - LARGE_MARKDOWN_TAIL_LENGTH)
  // Guard against a degenerate split where the snapped cuts cross.
  if (tailCut <= headCut) {
    return { head: content.slice(0, headCut), middle: "", tail: content.slice(headCut) }
  }
  return {
    head: content.slice(0, headCut),
    middle: content.slice(headCut, tailCut),
    tail: content.slice(tailCut),
  }
}

function MarkdownBody({ content }: { readonly content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[...remarkPlugins]}
      rehypePlugins={[rehypeHighlightPlugin]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  )
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
  const [showMiddle, setShowMiddle] = useState(false)
  // Gate the JSON.parse on size so oversized content doesn't pay the parse cost
  // only to be discarded by the large-content fallback below.
  const isJson = useMemo(() => content.length <= LARGE_MARKDOWN_CONTENT_THRESHOLD && isJsonBlock(content), [content])

  if (content.length > LARGE_MARKDOWN_CONTENT_THRESHOLD) {
    const { head, middle, tail } = splitLargeContent(content)

    return (
      <div className="prose prose-sm dark:prose-invert max-w-none wrap-break-word">
        <MarkdownBody content={head} />
        {middle.length > 0 &&
          (showMiddle ? (
            <MarkdownBody content={middle} />
          ) : (
            <button
              type="button"
              onClick={() => setShowMiddle(true)}
              className="not-prose group my-4 flex w-full items-center gap-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full border border-border bg-background px-3 py-1 group-hover:bg-muted">
                Show {middle.length.toLocaleString()} more characters
              </span>
              <span className="h-px flex-1 bg-border" />
            </button>
          ))}
        {tail.length > 0 && <MarkdownBody content={tail} />}
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
