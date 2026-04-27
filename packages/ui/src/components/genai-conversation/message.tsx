import { isJsonBlock } from "@repo/utils"
import { ChevronDownIcon, ChevronRightIcon, ScanSearchIcon } from "lucide-react"
import { useState } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { Part, type ToolCallResult } from "./part.tsx"

export type ToolCallActions = ReadonlyMap<string, () => void>

type PartType = GenAIMessage["parts"][number]

function isAlreadyCollapsible(parts: readonly PartType[]): boolean {
  return parts[0]?.type === "tool_call" || parts[0]?.type === "tool_call_response"
}

function getFirstLinePreview(parts: readonly PartType[]): string {
  const content = ((parts[0]?.content ?? "") as string).trim()

  if (!content) return "..."

  if (isJsonBlock(content)) {
    try {
      return JSON.stringify(JSON.parse(content))
    } catch {
      // fall through to line-based preview
    }
  }

  return (
    content
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim() ?? "..."
  )
}

function CollapsedPreview({ parts }: { readonly parts: readonly PartType[] }) {
  return (
    <div className="min-w-0 max-w-full truncate pr-6 text-sm select-none text-muted-foreground">
      {getFirstLinePreview(parts)}
    </div>
  )
}

function CollapseToggleButton({
  collapsed,
  onToggle,
  className,
}: {
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly className?: string
}) {
  return (
    <div
      className={cn("opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100", className)}
    >
      <Tooltip
        asChild
        trigger={
          <button
            type="button"
            data-no-navigate
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            aria-label={collapsed ? "Expand message" : "Collapse message"}
            className="flex items-center justify-center w-6 h-6 rounded-md border border-border bg-background shadow-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Icon icon={collapsed ? ChevronRightIcon : ChevronDownIcon} size="sm" />
          </button>
        }
      >
        <Text.H6>{collapsed ? "Expand" : "Collapse"}</Text.H6>
      </Tooltip>
    </div>
  )
}

function PartsRenderer({
  parts,
  toolResults,
  toolCallActions,
  messageIndex,
}: {
  readonly parts: readonly PartType[]
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly messageIndex?: number | undefined
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {parts.map((part, partIndex) => {
        if (!part) return null

        const partId = part.type === "tool_call" ? ((part as { id?: string }).id ?? "") : ""
        const result = toolResults?.get(partId)
        const onNavigateToSpan = toolCallActions?.get(partId)
        const isSelectableTextPart = part.type === "text" || part.type === "reasoning"
        return (
          <div
            key={partIndex}
            data-part-index={partIndex}
            data-content-type={part.type}
            className={cn("min-w-0", { "select-text": isSelectableTextPart })}
          >
            <Part
              part={part}
              messageIndex={messageIndex}
              partIndex={partIndex}
              {...(result ? { toolResult: result } : {})}
              {...(onNavigateToSpan ? { onNavigateToSpan } : {})}
            />
          </div>
        )
      })}
    </div>
  )
}

function UserMessage({
  message,
  messageIndex,
  alignment = "right",
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly alignment: "left" | "right"
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className={cn("flex min-w-0 max-w-full flex-col gap-1", alignment === "right" ? "items-end" : "items-start")}>
      <div className="relative min-w-0 max-w-full rounded-2xl bg-accent px-4 py-3">
        {!isAlreadyCollapsible(message.parts) && (
          <CollapseToggleButton
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
            className="absolute top-2 right-2 z-10"
          />
        )}
        {collapsed ? (
          <CollapsedPreview parts={message.parts} />
        ) : (
          <PartsRenderer parts={message.parts} messageIndex={messageIndex} />
        )}
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  messageIndex,
  toolResults,
  toolCallActions,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly onNavigate?: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="relative flex min-w-0 max-w-full w-full flex-col gap-1">
      <div className={cn("sticky top-0 h-0 overflow-visible z-10", { relative: !onNavigate })}>
        {onNavigate && (
          <Tooltip
            asChild
            trigger={
              <button
                type="button"
                onClick={onNavigate}
                className="absolute -left-8 flex items-center justify-center w-6 h-6 rounded-md border border-border bg-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
                title="View source span"
              >
                <ScanSearchIcon className="h-4 w-4" />
              </button>
            }
          >
            <Text.H6>View source span</Text.H6>
          </Tooltip>
        )}
        {!isAlreadyCollapsible(message.parts) && (
          <CollapseToggleButton
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
            className={cn("absolute -right-2 z-10", { "right-2": !onNavigate })}
          />
        )}
      </div>
      {collapsed ? (
        <CollapsedPreview parts={message.parts} />
      ) : (
        <PartsRenderer
          parts={message.parts}
          messageIndex={messageIndex}
          {...(toolResults ? { toolResults } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
        />
      )}
    </div>
  )
}

function SystemMessage({
  message,
  messageIndex,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
}) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <div className="relative min-w-0 max-w-full border-l-2 border-accent bg-muted/50 rounded-r-lg px-4 py-3">
        {!isAlreadyCollapsible(message.parts) && (
          <CollapseToggleButton
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
            className="absolute top-2 right-2 z-10"
          />
        )}
        {collapsed ? (
          <CollapsedPreview parts={message.parts} />
        ) : (
          <PartsRenderer parts={message.parts} messageIndex={messageIndex} />
        )}
      </div>
    </div>
  )
}

function ToolMessage({
  message,
  messageIndex,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="border border-dashed border-border rounded-lg px-4 py-3">
        <PartsRenderer parts={message.parts} messageIndex={messageIndex} />
      </div>
    </div>
  )
}

function UnknownRoleMessage({ message }: { readonly message: GenAIMessage }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="border-l-2 border-accent bg-muted/50 rounded-r-lg px-4 py-3">
        <PartsRenderer parts={message.parts} />
      </div>
    </div>
  )
}

export function Message({
  message,
  messageIndex,
  alignment = "right",
  toolResults,
  toolCallActions,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly alignment?: "left" | "right"
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly onNavigate?: () => void
}) {
  switch (message.role) {
    case "user":
      return <UserMessage message={message} messageIndex={messageIndex} alignment={alignment} />
    case "assistant":
      return (
        <AssistantMessage
          message={message}
          messageIndex={messageIndex}
          {...(toolResults ? { toolResults } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
          {...(onNavigate ? { onNavigate } : {})}
        />
      )
    case "system":
      return <SystemMessage message={message} messageIndex={messageIndex} />
    case "tool":
      return <ToolMessage message={message} messageIndex={messageIndex} />
    default:
      return <UnknownRoleMessage message={message} />
  }
}
