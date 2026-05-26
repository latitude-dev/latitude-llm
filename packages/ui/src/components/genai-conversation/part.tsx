import { CheckIcon, FileIcon, LinkIcon, TerminalIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { type ReactNode, use } from "react"
import type { GenAIPart } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { CodeBlockControls } from "../code-block/code-block-controls.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { CollapsibleBlock } from "./parts/collapsible-block.tsx"
import { formatJson, getKnownField, MediaFallback, renderMediaByModality } from "./parts/helpers.tsx"
import { isLexicalSearchHighlight } from "./parts/highlight-segments.ts"
import { MarkdownContent } from "./parts/lazy-markdown-content.tsx"
import { ToolCallBlock } from "./parts/tool-call-block.tsx"
import type {
  BlobPart,
  FilePart,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolCallResponsePart,
  ToolCallResult,
  UriPart,
} from "./parts/types.ts"
import { TextSelectionContext } from "./text-selection.tsx"

export { ReasoningGroup } from "./parts/reasoning-group.tsx"
export type { ToolCallResult } from "./parts/types.ts"

// Blue ring + ::before "Search result inside" label for parts whose
// rendered shape can't carry inline chips (tool_call_response). Spans the
// full message column so decorated and undecorated tool blocks line up.
function SearchHitDecoration({ hasHit, children }: { readonly hasHit: boolean; readonly children: ReactNode }) {
  if (!hasHit) return <>{children}</>
  return (
    <div
      className={cn(
        "relative w-full rounded-lg ring-2 ring-primary",
        "before:absolute before:-top-2 before:right-2 before:z-10",
        "before:content-['Search_result_inside']",
        "before:bg-primary before:text-primary-foreground",
        "before:px-2 before:py-0.5 before:text-[10px] before:font-medium before:rounded",
      )}
    >
      {children}
    </div>
  )
}

export function Part({
  part,
  toolResult,
  onNavigateToSpan,
  messageIndex,
  partIndex,
}: {
  readonly part: GenAIPart
  readonly toolResult?: ToolCallResult | undefined
  readonly onNavigateToSpan?: () => void
  readonly messageIndex?: number | undefined
  readonly partIndex?: number | undefined
}) {
  const selectionCtx = use(TextSelectionContext)
  const partHighlights =
    selectionCtx && messageIndex != null && partIndex != null
      ? selectionCtx.getHighlightsForBlock(messageIndex, partIndex)
      : []
  const partHasLexicalHit = partHighlights.some(isLexicalSearchHighlight)
  // Only the part containing the first search match opens automatically.
  // Other matched parts stay collapsed; their SearchHitDecoration still
  // signals the hit so the user can choose which to expand.
  const isFirstMatchPart =
    messageIndex != null &&
    partIndex != null &&
    selectionCtx?.firstMatchHint?.messageIndex === messageIndex &&
    selectionCtx.firstMatchHint.partIndex === partIndex

  switch (part.type) {
    case "text": {
      const p = part as TextPart
      const isRefusal = getKnownField<boolean>(p._provider_metadata, "isRefusal") === true

      const refusalBadge = isRefusal ? (
        <span className="inline-block">
          <Tooltip trigger={<TriangleAlertIcon className="w-4 h-4 mr-2 text-destructive" />}>Refusal</Tooltip>
        </span>
      ) : null

      return (
        <>
          {refusalBadge}
          <MarkdownContent content={p.content} messageIndex={messageIndex} partIndex={partIndex} />
        </>
      )
    }

    case "blob": {
      const p = part as BlobPart
      const mimeType = p.mime_type ?? (p.modality === "image" ? "image/png" : `${p.modality}/*`)
      const dataUri = `data:${mimeType};base64,${p.content}`
      const media = renderMediaByModality({ modality: p.modality, src: dataUri, mimeType })
      if (media) return media
      return <MediaFallback modality={p.modality} mimeType={p.mime_type} />
    }

    case "file": {
      const p = part as FilePart
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
          <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <Text.Mono size="h6" color="foregroundMuted" ellipsis>
            {p.file_id}
          </Text.Mono>
          <Text.H6 color="foregroundMuted">&middot; {p.modality}</Text.H6>
        </span>
      )
    }

    case "uri": {
      const p = part as UriPart
      const media = renderMediaByModality({
        modality: p.modality,
        src: p.uri,
        mimeType: p.mime_type ?? undefined,
      })
      if (media) return media

      return (
        <a
          href={p.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <Text.H6 color="primary">{p.uri}</Text.H6>
        </a>
      )
    }

    case "reasoning": {
      const p = part as ReasoningPart
      return (
        <div className="text-muted-foreground italic">
          <MarkdownContent content={p.content} messageIndex={messageIndex} partIndex={partIndex} />
        </div>
      )
    }

    case "tool_call": {
      const p = part as ToolCallPart
      // tool_call_response is absorbed into this block (see conversation.tsx
      // `resultMap`); the container marker is anchored here so the decoration
      // lands on the part the user actually sees. `key` flip re-evaluates
      // `defaultOpen` when first-match status changes between searches.
      return (
        <SearchHitDecoration hasHit={partHasLexicalHit}>
          <ToolCallBlock
            key={isFirstMatchPart ? "first-match" : "default"}
            call={p}
            defaultOpen={isFirstMatchPart}
            {...(toolResult ? { result: toolResult } : {})}
            {...(onNavigateToSpan ? { onNavigateToSpan } : {})}
          />
        </SearchHitDecoration>
      )
    }

    case "tool_call_response": {
      const p = part as ToolCallResponsePart
      const toolName = getKnownField<string>(p._provider_metadata, "toolName")
      const isError = getKnownField<boolean>(p._provider_metadata, "isError") === true
      const response = p.response ?? (part as { result?: unknown }).result
      const statusIcon = isError ? (
        <XIcon className="w-3.5 h-3.5 text-destructive" />
      ) : (
        <CheckIcon className="w-3.5 h-3.5 text-success" />
      )
      const responseContent = formatJson(response)

      return (
        <SearchHitDecoration hasHit={partHasLexicalHit}>
          <CollapsibleBlock
            key={isFirstMatchPart ? "first-match" : "default"}
            icon={<TerminalIcon className="w-3.5 h-3.5" />}
            label={<Text.Mono size="h6">{toolName ?? "Tool Result"}</Text.Mono>}
            variant={isError ? "destructive" : "default"}
            statusIcon={statusIcon}
            defaultOpen={isFirstMatchPart}
          >
            <div className="relative">
              <pre
                className={cn("overflow-auto rounded-lg p-3 text-xs", isError ? "bg-destructive-muted" : "bg-muted")}
              >
                {responseContent}
              </pre>
              <CodeBlockControls content={responseContent} language="json" />
            </div>
          </CollapsibleBlock>
        </SearchHitDecoration>
      )
    }

    default: {
      const fallbackContent = JSON.stringify(part, null, 2)
      return (
        <CollapsibleBlock
          icon={<FileIcon className="w-3.5 h-3.5" />}
          label={<Text.Mono size="h6">{part.type}</Text.Mono>}
        >
          <div className="relative">
            <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">{fallbackContent}</pre>
            <CodeBlockControls content={fallbackContent} language="json" />
          </div>
        </CollapsibleBlock>
      )
    }
  }
}
