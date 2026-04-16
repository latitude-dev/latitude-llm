import { Popover, PopoverAnchor } from "@repo/ui"
import { type RefObject, useRef } from "react"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationPopoverContent, AnnotationPopoverWrapper } from "./annotation-popover-content.tsx"

export interface AnnotationPopoverProps {
  readonly position: { x: number; y: number } | null
  readonly scrollContainerRef?: RefObject<HTMLElement | null> | undefined
  readonly projectId: string
  readonly annotations: readonly AnnotationRecord[]
  readonly showCreateForm?: boolean
  readonly isCreateLoading?: boolean
  readonly isUpdateLoading?: boolean
  readonly onSave: (data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onUpdate: (annotationId: string, data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onDelete?: (() => void) | undefined
  readonly onClose: () => void
}

export function AnnotationPopover({
  position,
  scrollContainerRef,
  projectId,
  annotations,
  showCreateForm = true,
  isCreateLoading = false,
  isUpdateLoading = false,
  onSave,
  onUpdate,
  onDelete,
  onClose,
}: AnnotationPopoverProps) {
  const lastAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const scrollAtOpenRef = useRef(0)

  if (position !== null) {
    lastAnchorRef.current = position
    scrollAtOpenRef.current = scrollContainerRef?.current?.scrollTop ?? 0
  }
  const anchorPoint = position ?? lastAnchorRef.current

  const virtualRef = useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => DOMRect.fromRect({ width: 0, height: 0, x: anchorPoint.x, y: anchorPoint.y }),
  })
  virtualRef.current = {
    getBoundingClientRect: () => {
      const scrollDelta = (scrollContainerRef?.current?.scrollTop ?? 0) - scrollAtOpenRef.current
      return DOMRect.fromRect({
        width: 0,
        height: 0,
        x: anchorPoint.x,
        y: anchorPoint.y - scrollDelta,
      })
    },
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose()
    }
  }

  return (
    <Popover open={position !== null} onOpenChange={handleOpenChange}>
      <PopoverAnchor virtualRef={virtualRef} />

      <AnnotationPopoverWrapper data-selection-popover sideOffset={8} updatePositionStrategy="always">
        <AnnotationPopoverContent
          projectId={projectId}
          annotations={annotations}
          showCreateForm={showCreateForm}
          isCreateLoading={isCreateLoading}
          isUpdateLoading={isUpdateLoading}
          onSave={onSave}
          onUpdate={onUpdate}
          onDelete={onDelete ?? onClose}
        />
      </AnnotationPopoverWrapper>
    </Popover>
  )
}
