import { isJsonBlock } from "@repo/utils"
import { ChevronDownIcon, ChevronRightIcon, ScanSearchIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { Part, type ToolCallResult } from "./part.tsx"
import { ChatDropdown } from "./parts/chat-dropdown.tsx"
import type { SubagentToolCallInfo } from "./parts/types.ts"

export type ToolCallActions = ReadonlyMap<string, () => void>

export type SubagentToolCalls = ReadonlyMap<string, SubagentToolCallInfo>

type PartType = GenAIMessage["parts"][number]

function isAlreadyCollapsible(parts: readonly PartType[] | undefined): boolean {
  return parts?.[0]?.type === "tool_call" || parts?.[0]?.type === "tool_call_response"
}

/** Tool calls/responses are always their own separate block (ToolCallBlock / SubagentCard) — never grouped into a dropdown. */
function isToolPart(part: PartType | null | undefined): boolean {
  return part?.type === "tool_call" || part?.type === "tool_call_response"
}

function partPreview(part: PartType | null | undefined): string {
  const content = ((part?.content ?? "") as string).trim()

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

function getFirstLinePreview(parts: readonly PartType[] | undefined): string {
  return partPreview(parts?.[0])
}

/**
 * Wraps a single flat (subagent-embedded) part's rendered content in its own
 * dropdown, collapsed by default behind an ellipsized one-line preview — no
 * icon, no label, just the content itself. Every message and every tool call
 * gets its own separate disclosure — parts are never grouped by the message
 * they came from.
 */
function FlatPartBody({ part, children }: { readonly part: PartType; readonly children: ReactNode }) {
  return <ChatDropdown collapsedPreview={partPreview(part)}>{children}</ChatDropdown>
}

function CollapsedPreview({ parts }: { readonly parts: readonly PartType[] | undefined }) {
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
            onMouseDown={(e) => {
              // Mouse clicks should not leave hover-only actions visible after the pointer leaves.
              e.preventDefault()
            }}
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
        <Text.H6 color="foregroundMuted">{collapsed ? "Expand" : "Collapse"}</Text.H6>
      </Tooltip>
    </div>
  )
}

function MessageActionsRail({ children }: { readonly children: ReactNode }) {
  return (
    <div className="sticky top-0 h-0 overflow-visible z-10">
      <div className="absolute -left-8 z-10 flex flex-col gap-1">{children}</div>
    </div>
  )
}

function ViewSourceSpanButton({ onNavigate }: { readonly onNavigate: () => void }) {
  return (
    <Tooltip
      asChild
      trigger={
        <button
          type="button"
          onClick={onNavigate}
          className="flex items-center justify-center w-6 h-6 rounded-md border border-border bg-background shadow-sm opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
          title="View source span"
        >
          <Icon icon={ScanSearchIcon} size="sm" />
        </button>
      }
    >
      <Text.H6 color="foregroundMuted">View source span</Text.H6>
    </Tooltip>
  )
}

function PartsRenderer({
  parts,
  toolResults,
  toolCallActions,
  subagentToolCalls,
  failedToolCallIds,
  messageIndex,
  flat = false,
}: {
  readonly parts: readonly PartType[] | undefined
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly subagentToolCalls?: SubagentToolCalls | undefined
  readonly failedToolCallIds?: ReadonlySet<string> | undefined
  readonly messageIndex?: number | undefined
  readonly flat?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {(parts ?? []).map((part, partIndex) => {
        if (!part) return null

        const partId = part.type === "tool_call" ? ((part as { id?: string }).id ?? "") : ""
        const result = toolResults?.get(partId)
        const onNavigateToSpan = toolCallActions?.get(partId)
        const subagent = subagentToolCalls?.get(partId)
        const toolCallFailed = partId.length > 0 && failedToolCallIds?.has(partId) === true
        const isSelectableTextPart = part.type === "text" || part.type === "reasoning"
        const partElement = (
          <Part
            part={part}
            messageIndex={messageIndex}
            partIndex={partIndex}
            toolCallFailed={toolCallFailed}
            flat={flat}
            {...(result ? { toolResult: result } : {})}
            {...(onNavigateToSpan ? { onNavigateToSpan } : {})}
            {...(subagent ? { subagent } : {})}
          />
        )
        return (
          <div
            key={partIndex}
            data-part-index={partIndex}
            data-content-type={part.type}
            className={cn("min-w-0", { "select-text": isSelectableTextPart })}
          >
            {flat && !isToolPart(part) ? <FlatPartBody part={part}>{partElement}</FlatPartBody> : partElement}
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
  flat = false,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly alignment: "left" | "right"
  readonly flat?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Flat (subagent-embedded) messages skip the collapse-toggle chrome and any
  // role-specific box entirely — every part renders and collapses on its own.
  if (flat) {
    return (
      <div className="relative flex min-w-0 max-w-full w-full flex-col gap-1">
        <PartsRenderer parts={message.parts} messageIndex={messageIndex} flat />
      </div>
    )
  }

  return (
    <div className={cn("flex min-w-0 max-w-full flex-col gap-1", alignment === "right" ? "items-end" : "items-start")}>
      <div className="relative min-w-0 max-w-full rounded-2xl bg-accent px-4 py-3">
        {!isAlreadyCollapsible(message.parts) && (
          <MessageActionsRail>
            <CollapseToggleButton collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
          </MessageActionsRail>
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
  flat = false,
  toolResults,
  toolCallActions,
  subagentToolCalls,
  failedToolCallIds,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly flat?: boolean
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly subagentToolCalls?: SubagentToolCalls | undefined
  readonly failedToolCallIds?: ReadonlySet<string> | undefined
  readonly onNavigate?: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  const partsRenderer = (
    <PartsRenderer
      parts={message.parts}
      messageIndex={messageIndex}
      flat={flat}
      {...(toolResults ? { toolResults } : {})}
      {...(toolCallActions ? { toolCallActions } : {})}
      {...(subagentToolCalls ? { subagentToolCalls } : {})}
      {...(failedToolCallIds ? { failedToolCallIds } : {})}
    />
  )

  // Flat (subagent-embedded) messages skip the collapse-toggle chrome entirely —
  // every part renders and collapses on its own.
  if (flat) {
    return <div className="relative flex min-w-0 max-w-full w-full flex-col gap-1">{partsRenderer}</div>
  }

  return (
    <div className="relative flex min-w-0 max-w-full w-full flex-col gap-1">
      <MessageActionsRail>
        {onNavigate && <ViewSourceSpanButton onNavigate={onNavigate} />}
        {!isAlreadyCollapsible(message.parts) && (
          <CollapseToggleButton collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        )}
      </MessageActionsRail>
      {collapsed ? <CollapsedPreview parts={message.parts} /> : partsRenderer}
    </div>
  )
}

function SystemMessage({
  message,
  messageIndex,
  flat = false,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly flat?: boolean
}) {
  const [collapsed, setCollapsed] = useState(!flat)

  // Flat (subagent-embedded) messages skip the collapse-toggle chrome and the
  // role box entirely — every part renders and collapses on its own.
  if (flat) {
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-1">
        <PartsRenderer parts={message.parts} messageIndex={messageIndex} flat />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <div className="relative min-w-0 max-w-full border-l-2 border-accent bg-muted/50 rounded-r-lg px-4 py-3">
        {!isAlreadyCollapsible(message.parts) && (
          <MessageActionsRail>
            <CollapseToggleButton collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
          </MessageActionsRail>
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
  flat = false,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly flat?: boolean
}) {
  if (flat) {
    return (
      <div className="flex flex-col gap-1">
        <PartsRenderer parts={message.parts} messageIndex={messageIndex} flat />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="border border-dashed border-border rounded-lg px-4 py-3">
        <PartsRenderer parts={message.parts} messageIndex={messageIndex} />
      </div>
    </div>
  )
}

function UnknownRoleMessage({ message, flat = false }: { readonly message: GenAIMessage; readonly flat?: boolean }) {
  if (flat) {
    return (
      <div className="flex flex-col gap-1">
        <PartsRenderer parts={message.parts} flat />
      </div>
    )
  }
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
  flat = false,
  toolResults,
  toolCallActions,
  subagentToolCalls,
  failedToolCallIds,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly alignment?: "left" | "right"
  /** Renders with no chat-bubble treatment, for nested contexts like a subagent's inline conversation. */
  readonly flat?: boolean
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly subagentToolCalls?: SubagentToolCalls | undefined
  readonly failedToolCallIds?: ReadonlySet<string> | undefined
  readonly onNavigate?: () => void
}) {
  switch (message.role) {
    case "user":
      return <UserMessage message={message} messageIndex={messageIndex} alignment={alignment} flat={flat} />
    case "assistant":
      return (
        <AssistantMessage
          message={message}
          messageIndex={messageIndex}
          flat={flat}
          {...(toolResults ? { toolResults } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
          {...(subagentToolCalls ? { subagentToolCalls } : {})}
          {...(failedToolCallIds ? { failedToolCallIds } : {})}
          {...(onNavigate ? { onNavigate } : {})}
        />
      )
    case "system":
      return <SystemMessage message={message} messageIndex={messageIndex} flat={flat} />
    case "tool":
      return <ToolMessage message={message} messageIndex={messageIndex} flat={flat} />
    default:
      return <UnknownRoleMessage message={message} flat={flat} />
  }
}
