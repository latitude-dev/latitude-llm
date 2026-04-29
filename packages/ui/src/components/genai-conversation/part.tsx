import { CheckIcon, FileIcon, LinkIcon, TerminalIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import type { GenAIPart } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { CodeBlockControls } from "../code-block/code-block-controls.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { CollapsibleBlock } from "./parts/collapsible-block.tsx"
import { formatJson, getKnownField, MediaFallback, renderMediaByModality } from "./parts/helpers.tsx"
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

export { ReasoningGroup } from "./parts/reasoning-group.tsx"
export type { ToolCallResult } from "./parts/types.ts"

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
      return (
        <ToolCallBlock
          call={p}
          {...(toolResult ? { result: toolResult } : {})}
          {...(onNavigateToSpan ? { onNavigateToSpan } : {})}
        />
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
        <CollapsibleBlock
          icon={<TerminalIcon className="w-3.5 h-3.5" />}
          label={<Text.Mono size="h6">{toolName ?? "Tool Result"}</Text.Mono>}
          variant={isError ? "destructive" : "default"}
          statusIcon={statusIcon}
        >
          <div className="relative">
            <pre className={cn("overflow-auto rounded-lg p-3 text-xs", isError ? "bg-destructive-muted" : "bg-muted")}>
              {responseContent}
            </pre>
            <CodeBlockControls content={responseContent} language="json" />
          </div>
        </CollapsibleBlock>
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
