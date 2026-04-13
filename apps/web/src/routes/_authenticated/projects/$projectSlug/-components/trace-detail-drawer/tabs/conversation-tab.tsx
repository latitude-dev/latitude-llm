import { Conversation, ScrollNavigator, type ScrollNavigatorHandle, Skeleton, Text } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { type MutableRefObject, type RefObject, useCallback, useRef } from "react"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import { useConversationSpanMaps } from "../../../../../../../domains/spans/spans.collection.ts"
import type { TraceDetailRecord } from "../../../../../../../domains/traces/traces.functions.ts"
import { AnnotationPopover } from "../../annotations/annotation-popover.tsx"
import {
  type TextSelectionPopoverControls,
  useAnnotationPopover,
} from "../../annotations/hooks/use-annotation-popover.ts"
import { useTraceAnnotationsData } from "../../annotations/hooks/use-trace-annotations-data.ts"
import { MessageAnnotationTrigger } from "../../annotations/message-annotation-trigger.tsx"

function ConversationContent({
  traceDetail,
  navigateToSpan,
  projectId,
  isActive,
  scrollContainerRef,
  textSelectionPopoverControlsRef,
  onPopoverClose,
}: {
  readonly traceDetail: TraceDetailRecord
  readonly navigateToSpan?: ((spanId: string) => void) | undefined
  readonly projectId: string
  readonly isActive: boolean
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null> | undefined
  readonly textSelectionPopoverControlsRef?: MutableRefObject<TextSelectionPopoverControls | null> | undefined
  readonly onPopoverClose?: (() => void) | undefined
}) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? internalScrollRef
  const navigatorRef = useRef<ScrollNavigatorHandle>(null)
  const navItemRefs = useRef<(HTMLDivElement | null)[]>([])

  const { data: spanMaps } = useConversationSpanMaps({
    projectId,
    traceId: traceDetail.traceId,
  })

  useHotkeys([
    {
      hotkey: "N",
      callback: () => navigatorRef.current?.navigate("down"),
      options: { enabled: isActive, ignoreInputs: true },
    },
    {
      hotkey: "P",
      callback: () => navigatorRef.current?.navigate("up"),
      options: { enabled: isActive, ignoreInputs: true },
    },
  ])

  const getSpanIdForMessage = useCallback((messageIndex: number) => spanMaps?.messageSpanMap[messageIndex], [spanMaps])

  const { messageLevelAnnotations, isCreatePending, isUpdatePending } = useTraceAnnotationsData({
    projectId,
    traceId: traceDetail.traceId,
  })

  const {
    highlightRanges,
    handleTextSelect,
    openExistingAnnotationPopover,
    textSelectionPopoverPosition,
    textSelectionAnnotations,
    createTextSelectionAnnotation,
    updateTextSelectionAnnotation,
    closeAnnotationPopover,
    updateTextSelectionPopoverPosition,
  } = useAnnotationPopover({
    projectId,
    traceId: traceDetail.traceId,
    isActive,
    getSpanIdForMessage,
  })

  if (textSelectionPopoverControlsRef) {
    textSelectionPopoverControlsRef.current = {
      openExistingAnnotationPopover,
      updateTextSelectionPopoverPosition,
    }
  }

  const messageActions =
    navigateToSpan && spanMaps && Object.keys(spanMaps.messageSpanMap).length > 0
      ? new Map(
          Object.entries(spanMaps.messageSpanMap).map(([idx, spanId]) => [Number(idx), () => navigateToSpan(spanId)]),
        )
      : undefined

  const toolCallActions =
    navigateToSpan && spanMaps && Object.keys(spanMaps.toolCallSpanMap).length > 0
      ? new Map(
          Object.entries(spanMaps.toolCallSpanMap).map(([toolCallId, spanId]) => [
            toolCallId,
            () => navigateToSpan(spanId),
          ]),
        )
      : undefined

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex flex-col py-8 px-4 overflow-y-auto flex-1">
        <Conversation
          systemInstructions={traceDetail.systemInstructions}
          messages={traceDetail.allMessages}
          enableNavigator
          scrollContainerRef={scrollRef}
          navigatorRef={navigatorRef}
          navItemRefsRef={navItemRefs}
          onTextSelect={handleTextSelect}
          highlightRanges={highlightRanges}
          messageAnnotationSlot={(messageIndex, role) => {
            if (role === "tool") return null
            const data = messageLevelAnnotations.get(messageIndex)
            return (
              <MessageAnnotationTrigger
                key={data?.annotations.map((a) => a.id).join(",") ?? `no-annotation-${messageIndex}`}
                messageIndex={messageIndex}
                projectId={projectId}
                traceId={traceDetail.traceId}
                spanId={spanMaps?.messageSpanMap[messageIndex]}
                annotations={data?.annotations ?? []}
                annotators={data?.annotators ?? []}
                onClose={onPopoverClose}
              />
            )
          }}
          {...(messageActions ? { messageActions } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
        />
        <AnnotationPopover
          position={textSelectionPopoverPosition}
          projectId={projectId}
          annotations={textSelectionAnnotations}
          showCreateForm={textSelectionAnnotations.length === 0}
          isCreateLoading={isCreatePending}
          isUpdateLoading={isUpdatePending}
          onSave={createTextSelectionAnnotation}
          onUpdate={updateTextSelectionAnnotation}
          onClose={() => {
            closeAnnotationPopover()
            onPopoverClose?.()
          }}
        />
      </div>
      <div className="absolute top-4 right-4 z-10">
        <ScrollNavigator
          ref={navigatorRef}
          scrollContainerRef={scrollRef}
          itemRefs={navItemRefs}
          prevLabel={
            <>
              Previous <HotkeyBadge hotkey="P" />
            </>
          }
          nextLabel={
            <>
              Next <HotkeyBadge hotkey="N" />
            </>
          }
        />
      </div>
    </div>
  )
}

export function ConversationTab({
  traceDetail,
  isDetailLoading,
  navigateToSpan,
  projectId,
  isActive,
  scrollContainerRef,
  textSelectionPopoverControlsRef,
  onPopoverClose,
}: {
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isDetailLoading: boolean
  /** Optional callback to navigate to a span. If not provided, message/tool call actions are hidden. */
  readonly navigateToSpan?: ((spanId: string) => void) | undefined
  readonly projectId: string
  readonly isActive: boolean
  /** Optional ref to the scroll container. Used for external scroll control (e.g., annotation navigation). */
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null> | undefined
  readonly textSelectionPopoverControlsRef?: MutableRefObject<TextSelectionPopoverControls | null> | undefined
  /** Optional callback when annotation popover closes. Used to clear selection state. */
  readonly onPopoverClose?: (() => void) | undefined
}) {
  if (isDetailLoading) {
    return (
      <div className="flex flex-col gap-4 py-8 px-4 flex-1">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (!traceDetail) {
    return (
      <div className="flex items-center justify-center py-6 flex-1">
        <Text.H5 color="foregroundMuted">No conversation data</Text.H5>
      </div>
    )
  }

  return (
    <ConversationContent
      isActive={isActive}
      traceDetail={traceDetail}
      navigateToSpan={navigateToSpan}
      projectId={projectId}
      scrollContainerRef={scrollContainerRef}
      textSelectionPopoverControlsRef={textSelectionPopoverControlsRef}
      onPopoverClose={onPopoverClose}
    />
  )
}
