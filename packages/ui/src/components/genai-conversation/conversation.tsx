import { cn, Text } from "@repo/ui"
import { type ReactNode, type Ref, type RefObject, useCallback, useMemo, useRef } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { ScrollNavigator, type ScrollNavigatorHandle } from "../scroll-navigator/scroll-navigator.tsx"
import { Message, type ToolCallActions } from "./message.tsx"
import type { ToolCallResult } from "./part.tsx"
import { getKnownField } from "./parts/helpers.tsx"
import { SelectionActionPopover } from "./selection-action-popover.tsx"
import {
  type HighlightRange,
  SELECTION_HIGHLIGHT_CLASSES,
  type TextSelectionAnchor,
  TextSelectionProvider,
} from "./text-selection.tsx"

interface ToolResponsePart {
  readonly type: "tool_call_response"
  readonly id?: string | null
  readonly response?: unknown
  readonly result?: unknown
  readonly _provider_metadata?: Record<string, unknown>
}

function buildToolResultsMap(messages: readonly (GenAIMessage | null)[]): {
  resultMap: ReadonlyMap<string, ToolCallResult>
  absorbedIndexes: ReadonlySet<number>
} {
  const resultMap = new Map<string, ToolCallResult>()
  const absorbedIndexes = new Set<number>()

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || msg.role !== "tool") continue

    const parts = msg.parts ?? []
    let allAbsorbed = true

    for (const part of parts) {
      if (part.type !== "tool_call_response") {
        allAbsorbed = false
        continue
      }

      const p = part as ToolResponsePart
      const id = p.id
      if (!id) {
        allAbsorbed = false
        continue
      }

      const response = p.response ?? p.result
      const isError = getKnownField<boolean>(p._provider_metadata, "isError") === true
      resultMap.set(id, { response, isError })
    }

    if (allAbsorbed && parts.length > 0) {
      absorbedIndexes.add(i)
    }
  }

  return { resultMap, absorbedIndexes }
}

function normalizeMessage(message: GenAIMessage): GenAIMessage {
  if (message.parts && message.parts.length > 0) return message

  const content = (message as { content?: string }).content
  if (typeof content === "string") {
    return { ...message, parts: [{ type: "text" as const, content }] }
  }

  return message
}

export function Conversation({
  messages,
  enableNavigator = false,
  scrollContainerRef,
  navigatorRef,
  navItemRefsRef,
  prevLabel,
  nextLabel,
  messageActions,
  toolCallActions,
  onTextSelect,
  onSelectionDismiss,
  clearSelectionRef,
  highlightRanges,
  onAnnotationClick,
  messageAnnotationSlot,
}: {
  readonly messages: readonly (GenAIMessage | null)[]
  readonly enableNavigator?: boolean
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null>
  /** Ref to imperatively call navigate() on the ScrollNavigator (e.g. from a keyboard shortcut). */
  readonly navigatorRef?: Ref<ScrollNavigatorHandle>
  /**
   * When provided, Conversation writes message element refs into this ref instead of an internal one,
   * and does NOT render its own ScrollNavigator. The parent is responsible for rendering ScrollNavigator
   * and positioning it (e.g. absolutely outside the scroll container).
   */
  readonly navItemRefsRef?: RefObject<(HTMLDivElement | null)[]>
  /** Custom label for the "previous" navigator button (e.g. with a HotkeyBadge). */
  readonly prevLabel?: ReactNode
  /** Custom label for the "next" navigator button (e.g. with a HotkeyBadge). */
  readonly nextLabel?: ReactNode
  /** Map of original message index → action, renders a floating navigate button on attributed assistant messages. */
  readonly messageActions?: ReadonlyMap<number, () => void>
  /** Map of toolCallId → action, renders a navigate button inside each ToolCallBlock. */
  readonly toolCallActions?: ToolCallActions
  /** Called when the user selects text within a message part. Emits the canonical anchor and popover position. */
  readonly onTextSelect?:
    | ((anchor: TextSelectionAnchor, position: { x: number; y: number }, passed: boolean | null) => void)
    | undefined
  /** Called when the selection highlight is cleared (e.g. ESC, click outside). Use to close external popovers. */
  readonly onSelectionDismiss?: (() => void) | undefined
  /** Ref that receives a function to imperatively clear the selection highlight from outside. */
  readonly clearSelectionRef?: RefObject<(() => void) | null> | undefined
  /** Highlight ranges to paint on text parts (e.g. from persisted annotations). */
  readonly highlightRanges?: ReadonlyArray<HighlightRange> | undefined
  /** Called when a persisted annotation highlight is clicked. Receives the annotation id and click position. */
  readonly onAnnotationClick?: ((annotationId: string, position: { x: number; y: number }) => void) | undefined
  /** Renders a slot below each message. Receives the original messageIndex and role. */
  readonly messageAnnotationSlot?: ((messageIndex: number, role: string) => ReactNode) | undefined
}) {
  const internalNavItemRefs = useRef<(HTMLDivElement | null)[]>([])
  // If the parent provides navItemRefsRef it owns the ScrollNavigator; use their ref directly.
  const navItemRefs = navItemRefsRef ?? internalNavItemRefs
  const containerRef = useRef<HTMLDivElement>(null)
  const enableTextSelection = !!onTextSelect || (highlightRanges != null && highlightRanges.length > 0)

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onAnnotationClick) return
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-annotation-id]")
      if (!target) return

      const annotationId = target.getAttribute("data-annotation-id")
      if (!annotationId) return

      const partRoot = target.closest("[data-part-index]") ?? document.body
      const segments = partRoot.querySelectorAll(`[data-annotation-id="${annotationId}"]`)
      let left = e.clientX
      let bottom = e.clientY
      if (segments.length > 0) {
        let minLeft = Number.POSITIVE_INFINITY
        let maxBottom = Number.NEGATIVE_INFINITY
        for (const seg of segments) {
          const r = seg.getBoundingClientRect()
          if (r.left < minLeft) minLeft = r.left
          if (r.bottom > maxBottom) maxBottom = r.bottom
        }
        left = minLeft
        bottom = maxBottom
      }
      onAnnotationClick(annotationId, { x: left, y: bottom })
    },
    [onAnnotationClick],
  )

  const { resultMap, visibleMessages } = useMemo(() => {
    const { resultMap, absorbedIndexes } = buildToolResultsMap(messages)

    const visibleMessages = messages.reduce<{ message: GenAIMessage; index: number }[]>((acc, msg, i) => {
      if (!msg) return acc
      if (absorbedIndexes.has(i)) return acc

      acc.push({
        message: normalizeMessage(msg),
        index: i,
      })
      return acc
    }, [])

    return { resultMap, visibleMessages }
  }, [messages])

  navItemRefs.current.length = visibleMessages.length

  if (visibleMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">No conversation data</Text.H5>
      </div>
    )
  }

  const content = (
    // biome-ignore lint/a11y/useKeyWithClickEvents: delegated click for annotation spans (keyboard handled by Escape listener)
    // biome-ignore lint/a11y/noStaticElementInteractions: delegated event handler — actual interactive targets are annotated spans
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={cn("flex min-w-0 flex-col gap-6", {
        "select-none": !enableTextSelection,
        [SELECTION_HIGHLIGHT_CLASSES]: enableTextSelection,
      })}
    >
      {visibleMessages.map(({ message, index }, i) => {
        const onNavigate = messageActions?.get(index)
        const isAssistant = message.role === "assistant"
        const isUser = message.role === "user"
        const annotationSlot = messageAnnotationSlot?.(index, message.role)

        return (
          <div
            key={index}
            ref={(el) => {
              navItemRefs.current[i] = el
            }}
            data-message-index={index}
            className={cn("group group/message relative min-w-0 rounded-lg pl-4 pr-4", {
              "pl-10 py-2 transition-colors hover:bg-muted/50": isAssistant && messageActions,
            })}
          >
            {isUser ? (
              <div className="flex min-w-0 flex-col items-end">
                <div className="flex min-w-0 max-w-[85%] flex-col items-start">
                  <Message
                    message={message}
                    messageIndex={index}
                    alignment="left"
                    {...(toolCallActions ? { toolCallActions } : {})}
                  />
                  {annotationSlot && <div className="mt-3 flex w-full justify-end">{annotationSlot}</div>}
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 w-full flex-col items-start">
                <Message
                  message={message}
                  messageIndex={index}
                  alignment="left"
                  toolResults={message.role === "assistant" ? resultMap : undefined}
                  {...(onNavigate ? { onNavigate } : {})}
                  {...(toolCallActions ? { toolCallActions } : {})}
                />
                {annotationSlot && <div className="mt-3">{annotationSlot}</div>}
              </div>
            )}
          </div>
        )
      })}

      {enableNavigator && !navItemRefsRef && scrollContainerRef && (
        <ScrollNavigator
          ref={navigatorRef}
          scrollContainerRef={scrollContainerRef}
          itemRefs={navItemRefs}
          {...(prevLabel !== undefined ? { prevLabel } : {})}
          {...(nextLabel !== undefined ? { nextLabel } : {})}
        />
      )}
    </div>
  )

  if (enableTextSelection) {
    return (
      <TextSelectionProvider
        messages={messages}
        containerRef={containerRef}
        onSelect={onTextSelect}
        onDismiss={onSelectionDismiss}
        clearSelectionRef={clearSelectionRef}
        highlightRanges={highlightRanges}
      >
        {content}
        <SelectionActionPopover />
      </TextSelectionProvider>
    )
  }

  return content
}
