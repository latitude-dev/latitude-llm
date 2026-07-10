import { isJsonBlock } from "@repo/utils"
import { ChevronDownIcon, ChevronRightIcon, ScanSearchIcon } from "lucide-react"
import { type ReactNode, type Ref, useLayoutEffect, useRef, useState } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { Part, type ToolCallResult } from "./part.tsx"

export type ToolCallActions = ReadonlyMap<string, () => void>

type PartType = GenAIMessage["parts"][number]

function isAlreadyCollapsible(parts: readonly PartType[] | undefined): boolean {
  return parts?.[0]?.type === "tool_call" || parts?.[0]?.type === "tool_call_response"
}

function hasPotentiallyCollapsibleContent(parts: readonly PartType[] | undefined): boolean {
  if (!parts?.length || isAlreadyCollapsible(parts)) return false
  if (parts.length > 1) return true

  const content = parts[0]?.content
  if (typeof content !== "string") return true

  return content.length > 100 || content.includes("\n") || isJsonBlock(content)
}

function canCollapseRenderedContent(element: HTMLDivElement): boolean {
  const textPart = element.querySelector<HTMLElement>('[data-content-type="text"], [data-content-type="reasoning"]')
  const firstTextBlock = textPart?.querySelector<HTMLElement>("p, h1, h2, h3, h4, h5, h6") ?? textPart
  const lineHeight = firstTextBlock ? Number.parseFloat(window.getComputedStyle(firstTextBlock).lineHeight) : 24
  const singleLineHeight = Number.isFinite(lineHeight) ? lineHeight : 24

  return element.getBoundingClientRect().height > singleLineHeight + 1
}

function useMessageCollapse(parts: readonly PartType[] | undefined, defaultCollapsed = false) {
  const potentiallyCollapsible = hasPotentiallyCollapsibleContent(parts)
  const [collapsed, setCollapsed] = useState(defaultCollapsed && potentiallyCollapsible)
  const [canCollapse, setCanCollapse] = useState(potentiallyCollapsible)
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (collapsed || isAlreadyCollapsible(parts)) return

    const element = contentRef.current
    if (!element) return

    const measure = () => setCanCollapse(canCollapseRenderedContent(element))
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()

    return () => observer.disconnect()
  }, [collapsed, parts])

  return { collapsed, setCollapsed, canCollapse, contentRef }
}

function getFirstLinePreview(parts: readonly PartType[] | undefined): string {
  const content = ((parts?.[0]?.content ?? "") as string).trim()

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
        <Text.H6>{collapsed ? "Expand" : "Collapse"}</Text.H6>
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
      <Text.H6>View source span</Text.H6>
    </Tooltip>
  )
}

function PartsRenderer({
  parts,
  toolResults,
  toolCallActions,
  failedToolCallIds,
  messageIndex,
  contentRef,
}: {
  readonly parts: readonly PartType[] | undefined
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly failedToolCallIds?: ReadonlySet<string> | undefined
  readonly messageIndex?: number | undefined
  readonly contentRef?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={contentRef} className="flex min-w-0 flex-col gap-2">
      {(parts ?? []).map((part, partIndex) => {
        if (!part) return null

        const partId = part.type === "tool_call" ? ((part as { id?: string }).id ?? "") : ""
        const result = toolResults?.get(partId)
        const onNavigateToSpan = toolCallActions?.get(partId)
        const toolCallFailed = partId.length > 0 && failedToolCallIds?.has(partId) === true
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
              toolCallFailed={toolCallFailed}
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
  const { collapsed, setCollapsed, canCollapse, contentRef } = useMessageCollapse(message.parts)
  return (
    <div className={cn("flex min-w-0 max-w-full flex-col gap-1", alignment === "right" ? "items-end" : "items-start")}>
      <div className="relative min-w-0 max-w-full rounded-2xl bg-accent px-4 py-3">
        {canCollapse && (
          <MessageActionsRail>
            <CollapseToggleButton collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
          </MessageActionsRail>
        )}
        {collapsed ? (
          <CollapsedPreview parts={message.parts} />
        ) : (
          <PartsRenderer parts={message.parts} messageIndex={messageIndex} contentRef={contentRef} />
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
  failedToolCallIds,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly failedToolCallIds?: ReadonlySet<string> | undefined
  readonly onNavigate?: () => void
}) {
  const { collapsed, setCollapsed, canCollapse, contentRef } = useMessageCollapse(message.parts)
  return (
    <div className="relative flex min-w-0 max-w-full w-full flex-col gap-1">
      <MessageActionsRail>
        {onNavigate && <ViewSourceSpanButton onNavigate={onNavigate} />}
        {canCollapse && (
          <CollapseToggleButton collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        )}
      </MessageActionsRail>
      {collapsed ? (
        <CollapsedPreview parts={message.parts} />
      ) : (
        <PartsRenderer
          parts={message.parts}
          messageIndex={messageIndex}
          {...(toolResults ? { toolResults } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
          {...(failedToolCallIds ? { failedToolCallIds } : {})}
          contentRef={contentRef}
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
  const { collapsed, setCollapsed, canCollapse, contentRef } = useMessageCollapse(message.parts, true)
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <div className="relative min-w-0 max-w-full border-l-2 border-accent bg-muted/50 rounded-r-lg px-4 py-3">
        {canCollapse && (
          <MessageActionsRail>
            <CollapseToggleButton collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
          </MessageActionsRail>
        )}
        {collapsed ? (
          <CollapsedPreview parts={message.parts} />
        ) : (
          <PartsRenderer parts={message.parts} messageIndex={messageIndex} contentRef={contentRef} />
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
  failedToolCallIds,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly messageIndex?: number | undefined
  readonly alignment?: "left" | "right"
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly failedToolCallIds?: ReadonlySet<string> | undefined
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
          {...(failedToolCallIds ? { failedToolCallIds } : {})}
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
