import {
  Conversation,
  type HighlightRange,
  ScrollNavigator,
  type ScrollNavigatorHandle,
  Skeleton,
  Text,
  type TextSelectionAnchor,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useCallback, useMemo, useRef, useState } from "react"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import {
  useAnnotationsByTrace,
  useCreateAnnotation,
  useDeleteAnnotation,
  useUpdateAnnotation,
} from "../../../../../../../domains/annotations/annotations.collection.ts"
import {
  type AnnotationRecord,
  isDraftAnnotation,
} from "../../../../../../../domains/annotations/annotations.functions.ts"
import { useConversationSpanMaps } from "../../../../../../../domains/spans/spans.collection.ts"
import type { TraceDetailRecord } from "../../../../../../../domains/traces/traces.functions.ts"
import { AnnotationPopover } from "../-components/annotation-popover.tsx"
import { MessageAnnotationRow } from "./conversation-tab/message-annotation-row.tsx"

// Popover state for text-selection annotations (Goal C).
type PopoverState = {
  position: { x: number; y: number }
  passed: boolean | null
  comment: string
  issueId: string | null
} & ({ kind: "new"; anchor: TextSelectionAnchor } | { kind: "existing"; annotation: AnnotationRecord })

function ConversationContent({
  traceDetail,
  navigateToSpan,
  projectId,
  isActive,
}: {
  readonly traceDetail: TraceDetailRecord
  readonly navigateToSpan?: ((spanId: string) => void) | undefined
  readonly projectId: string
  readonly isActive: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
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
      options: { enabled: isActive },
    },
    {
      hotkey: "P",
      callback: () => navigatorRef.current?.navigate("up"),
      options: { enabled: isActive },
    },
  ])

  const { data: annotations } = useAnnotationsByTrace({
    projectId,
    traceId: traceDetail.traceId,
    draftMode: "include",
  })

  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()
  const deleteMutation = useDeleteAnnotation()

  const [popoverState, setPopoverState] = useState<PopoverState | null>(null)
  const openPopover = isActive && popoverState ? popoverState : null

  const openAnnotationPopover = useCallback(
    (next: PopoverState) => {
      if (!isActive) return
      setPopoverState(next)
    },
    [isActive],
  )

  const closeAnnotationPopover = useCallback(() => {
    setPopoverState(null)
  }, [])

  // Text-level annotations (all 4 anchor fields) → highlight ranges with onClick.
  // Message-level annotations (messageIndex only, no partIndex) → message annotation row via slot.
  const { highlightRanges, messageLevelAnnotations } = useMemo(() => {
    const ranges: HighlightRange[] = []
    const messageMap = new Map<number, AnnotationRecord>()

    if (!annotations?.items) return { highlightRanges: ranges, messageLevelAnnotations: messageMap }

    for (const a of annotations.items) {
      const { messageIndex, partIndex, startOffset, endOffset } = a.metadata

      if (
        messageIndex !== undefined &&
        partIndex !== undefined &&
        startOffset !== undefined &&
        endOffset !== undefined
      ) {
        const annotation = a
        ranges.push({
          messageIndex,
          partIndex,
          startOffset,
          endOffset,
          type: "annotation",
          passed: a.passed,
          id: a.id,
          onClick: (position) => {
            openAnnotationPopover({
              kind: "existing",
              annotation,
              position,
              passed: annotation.passed,
              comment: annotation.feedback ?? "",
              issueId: annotation.issueId,
            })
          },
        })
      } else if (messageIndex !== undefined && partIndex === undefined) {
        messageMap.set(messageIndex, a)
      }
    }

    return { highlightRanges: ranges, messageLevelAnnotations: messageMap }
  }, [annotations, openAnnotationPopover])

  const handleTextSelect = useCallback(
    (anchor: TextSelectionAnchor, position: { x: number; y: number }) => {
      // If this exact range already has an annotation, open it for editing instead.
      const existing = highlightRanges.find(
        (r) =>
          r.messageIndex === anchor.messageIndex &&
          r.partIndex === anchor.partIndex &&
          r.startOffset === anchor.startOffset &&
          r.endOffset === anchor.endOffset,
      )
      if (existing?.id) {
        const annotation = annotations?.items.find((a) => a.id === existing.id)
        if (annotation) {
          openAnnotationPopover({
            kind: "existing",
            annotation,
            position,
            passed: annotation.passed,
            comment: annotation.feedback ?? "",
            issueId: annotation.issueId,
          })
          return
        }
      }
      openAnnotationPopover({
        kind: "new",
        anchor,
        position,
        passed: null,
        comment: "",
        issueId: null,
      })
    },
    [highlightRanges, annotations, openAnnotationPopover],
  )

  function handlePopoverConfirm() {
    if (!popoverState || popoverState.passed === null) return
    const { passed, comment, issueId } = popoverState
    const feedback = comment.trim() || " "

    if (popoverState.kind === "new") {
      const { anchor } = popoverState
      createMutation.mutate(
        {
          projectId,
          traceId: traceDetail.traceId,
          value: passed ? 1 : 0,
          passed,
          feedback,
          ...(issueId ? { issueId } : {}),
          anchor: {
            messageIndex: anchor.messageIndex,
            partIndex: anchor.partIndex,
            startOffset: anchor.startOffset,
            endOffset: anchor.endOffset,
          },
        },
        { onSuccess: closeAnnotationPopover },
      )
    } else {
      const { annotation } = popoverState
      updateMutation.mutate(
        {
          scoreId: annotation.id,
          projectId,
          traceId: traceDetail.traceId,
          value: passed ? 1 : 0,
          passed,
          feedback,
          ...(issueId ? { issueId } : {}),
          ...(annotation.metadata.messageIndex !== undefined
            ? {
                anchor: {
                  messageIndex: annotation.metadata.messageIndex,
                  partIndex: annotation.metadata.partIndex,
                  startOffset: annotation.metadata.startOffset,
                  endOffset: annotation.metadata.endOffset,
                },
              }
            : {}),
        },
        { onSuccess: closeAnnotationPopover },
      )
    }
  }

  function handlePopoverDelete() {
    if (!popoverState || popoverState.kind !== "existing") return
    deleteMutation.mutate({ scoreId: popoverState.annotation.id, projectId }, { onSuccess: closeAnnotationPopover })
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

  const popoverIsLoading = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending
  const isPopoverEditable = openPopover?.kind === "existing" ? isDraftAnnotation(openPopover.annotation) : true

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex flex-col py-8 pr-4 overflow-y-auto flex-1">
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
            return (
              <MessageAnnotationRow
                key={messageLevelAnnotations.get(messageIndex)?.id ?? `no-annotation-${messageIndex}`}
                messageIndex={messageIndex}
                projectId={projectId}
                traceId={traceDetail.traceId}
                spanId={spanMaps?.messageSpanMap[messageIndex]}
                existingAnnotation={messageLevelAnnotations.get(messageIndex)}
              />
            )
          }}
          {...(messageActions ? { messageActions } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
        />
        <AnnotationPopover
          position={openPopover?.position ?? null}
          passed={openPopover?.passed ?? null}
          comment={openPopover?.comment ?? ""}
          issueId={openPopover?.issueId ?? null}
          projectId={projectId}
          isEditable={isPopoverEditable}
          isExisting={openPopover?.kind === "existing"}
          isLoading={popoverIsLoading}
          onPassedChange={(p) => setPopoverState((prev) => (prev ? { ...prev, passed: p } : null))}
          onCommentChange={(c) => setPopoverState((prev) => (prev ? { ...prev, comment: c } : null))}
          onIssueChange={(id) => setPopoverState((prev) => (prev ? { ...prev, issueId: id } : null))}
          onConfirm={handlePopoverConfirm}
          onDelete={handlePopoverDelete}
          onClose={closeAnnotationPopover}
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
}: {
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isDetailLoading: boolean
  /** Optional callback to navigate to a span. If not provided, message/tool call actions are hidden. */
  readonly navigateToSpan?: ((spanId: string) => void) | undefined
  readonly projectId: string
  readonly isActive: boolean
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
    />
  )
}
