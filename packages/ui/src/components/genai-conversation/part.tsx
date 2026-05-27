import { base64ByteLength } from "@repo/utils"
import { CheckIcon, FileIcon, TerminalIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { type ReactNode, use } from "react"
import type { GenAIPart } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { CodeBlockControls } from "../code-block/code-block-controls.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { CollapsibleBlock } from "./parts/collapsible-block.tsx"
import { FileCard } from "./parts/file-card.tsx"
import { formatJson, getKnownField, renderMediaByModality } from "./parts/helpers.tsx"
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

/** Last non-empty path segment of a URI, used as a file card's display name (undefined if none). */
function fileNameFromUri(uri: string): string | undefined {
  try {
    const path = new URL(uri).pathname
    const segment = path.split("/").filter(Boolean).pop()
    return segment ? decodeURIComponent(segment) : undefined
  } catch {
    const segment = uri.split(/[?#]/)[0]?.split("/").filter(Boolean).pop()
    return segment || undefined
  }
}

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
      // Fall back to a valid concrete MIME — `${modality}/*` (e.g. "document/*") is not a real
      // type and would produce an invalid data URI, breaking the FileCard download below.
      const mimeType = p.mime_type ?? (p.modality === "image" ? "image/png" : "application/octet-stream")
      const dataUri = `data:${mimeType};base64,${p.content}`
      const media = renderMediaByModality({ modality: p.modality, src: dataUri, mimeType })
      if (media) return media
      // Non-media blob (e.g. a document): show a file card with a download from the inline data.
      return (
        <FileCard
          mimeType={p.mime_type ?? undefined}
          modality={p.modality}
          sizeBytes={base64ByteLength(p.content)}
          downloadDataUri={dataUri}
        />
      )
    }

    case "file": {
      const p = part as FilePart
      return <FileCard mimeType={p.mime_type ?? undefined} modality={p.modality} fileId={p.file_id} />
    }

    case "uri": {
      const p = part as UriPart
      const media = renderMediaByModality({
        modality: p.modality,
        src: p.uri,
        mimeType: p.mime_type ?? undefined,
        href: p.uri,
      })
      if (media) return media

      // Non-media URI (e.g. a linked document): show a file card that opens the original.
      return (
        <FileCard
          fileName={fileNameFromUri(p.uri)}
          mimeType={p.mime_type ?? undefined}
          modality={p.modality}
          href={p.uri}
        />
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
