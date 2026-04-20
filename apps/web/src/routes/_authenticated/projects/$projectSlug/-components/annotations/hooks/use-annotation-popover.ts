import type { TextSelectionAnchor } from "@repo/ui"
import { useCallback, useState } from "react"
import {
  type AnnotationRecord,
  isDraftAnnotation,
} from "../../../../../../../domains/annotations/annotations.functions.ts"
import { type AnnotationFormData, useTraceAnnotationsData } from "./use-trace-annotations-data.ts"

type AnnotationPopoverState = {
  position: { x: number; y: number }
  passed: boolean | null
  comment: string
  issueId: string | null
} & ({ kind: "new"; anchor: TextSelectionAnchor } | { kind: "existing"; annotation: AnnotationRecord })

interface UseAnnotationPopoverOptions {
  readonly projectId: string
  readonly traceId: string
  readonly isActive: boolean
  readonly getSpanIdForMessage?: (messageIndex: number) => string | undefined
}

export interface TextSelectionPopoverControls {
  readonly openExistingAnnotationPopover: (annotation: AnnotationRecord, position: { x: number; y: number }) => void
  readonly updateTextSelectionPopoverPosition: (position: { x: number; y: number }) => void
}

export function useAnnotationPopover({
  projectId,
  traceId,
  isActive,
  getSpanIdForMessage,
}: UseAnnotationPopoverOptions) {
  const {
    annotations,
    highlightRanges,
    createAnnotation,
    updateAnnotation,
    isCreatePending,
    isUpdatePending,
    isDeletePending,
  } = useTraceAnnotationsData({ projectId, traceId })

  const [popoverState, setPopoverState] = useState<AnnotationPopoverState | null>(null)
  const openPopover = isActive && popoverState ? popoverState : null

  const openAnnotationPopover = useCallback(
    (next: AnnotationPopoverState) => {
      if (!isActive) return
      setPopoverState(next)
    },
    [isActive],
  )

  const openExistingAnnotationPopover = useCallback(
    (annotation: AnnotationRecord, position: { x: number; y: number }) => {
      openAnnotationPopover({
        kind: "existing",
        annotation,
        position,
        passed: annotation.passed,
        comment: annotation.feedback ?? "",
        issueId: annotation.issueId,
      })
    },
    [openAnnotationPopover],
  )

  const closeAnnotationPopover = useCallback(() => {
    setPopoverState(null)
  }, [])

  const updateTextSelectionPopoverPosition = useCallback((position: { x: number; y: number }) => {
    setPopoverState((current) => {
      if (!current) return current
      if (current.position.x === position.x && current.position.y === position.y) return current
      return { ...current, position }
    })
  }, [])

  const onAnnotationClick = useCallback(
    (annotationId: string, position: { x: number; y: number }) => {
      const annotation = annotations.find((a) => a.id === annotationId)
      if (annotation) openExistingAnnotationPopover(annotation, position)
    },
    [annotations, openExistingAnnotationPopover],
  )

  const handleTextSelect = useCallback(
    (anchor: TextSelectionAnchor, position: { x: number; y: number }, passed: boolean | null) => {
      const existing = highlightRanges.find(
        (r) =>
          r.messageIndex === anchor.messageIndex &&
          r.partIndex === anchor.partIndex &&
          r.startOffset === anchor.startOffset &&
          r.endOffset === anchor.endOffset,
      )
      if (existing?.id) {
        const annotation = annotations.find((a) => a.id === existing.id)
        if (annotation) {
          openExistingAnnotationPopover(annotation, position)
          return
        }
      }
      openAnnotationPopover({
        kind: "new",
        anchor,
        position,
        passed,
        comment: "",
        issueId: null,
      })
    },
    [highlightRanges, annotations, openAnnotationPopover, openExistingAnnotationPopover],
  )

  const isPopoverLoading = isCreatePending || isUpdatePending || isDeletePending
  const isPopoverEditable = openPopover?.kind === "existing" ? isDraftAnnotation(openPopover.annotation) : true

  const textSelectionPopoverPosition = openPopover?.position ?? null
  const textSelectionInitialPassed: boolean | null = openPopover?.kind === "new" ? openPopover.passed : null
  const textSelectionAnnotations: readonly AnnotationRecord[] =
    openPopover?.kind === "existing" ? [openPopover.annotation] : []

  const createTextSelectionAnnotation = useCallback(
    (formData: AnnotationFormData) => {
      if (!openPopover) return

      const messageIndex =
        openPopover.kind === "new" ? openPopover.anchor.messageIndex : openPopover.annotation.metadata.messageIndex

      const anchor =
        openPopover.kind === "new"
          ? {
              messageIndex: openPopover.anchor.messageIndex,
              partIndex: openPopover.anchor.partIndex,
              startOffset: openPopover.anchor.startOffset,
              endOffset: openPopover.anchor.endOffset,
            }
          : {
              messageIndex: openPopover.annotation.metadata.messageIndex,
              partIndex: openPopover.annotation.metadata.partIndex,
              startOffset: openPopover.annotation.metadata.startOffset,
              endOffset: openPopover.annotation.metadata.endOffset,
            }

      const spanId = messageIndex !== undefined ? (getSpanIdForMessage?.(messageIndex) ?? null) : null

      createAnnotation({ ...formData, anchor, spanId }, { onSuccess: closeAnnotationPopover })
    },
    [openPopover, createAnnotation, closeAnnotationPopover, getSpanIdForMessage],
  )

  const updateTextSelectionAnnotation = useCallback(
    (annotationId: string, formData: AnnotationFormData) => {
      updateAnnotation(annotationId, formData, {
        onSuccess: closeAnnotationPopover,
      })
    },
    [updateAnnotation, closeAnnotationPopover],
  )

  return {
    highlightRanges,
    onAnnotationClick,
    popoverState: openPopover,
    isPopoverLoading,
    isPopoverEditable,
    openAnnotationPopover,
    openExistingAnnotationPopover,
    closeAnnotationPopover,
    updateTextSelectionPopoverPosition,
    handleTextSelect,
    textSelectionPopoverPosition,
    textSelectionInitialPassed,
    textSelectionAnnotations,
    createTextSelectionAnnotation,
    updateTextSelectionAnnotation,
  }
}
