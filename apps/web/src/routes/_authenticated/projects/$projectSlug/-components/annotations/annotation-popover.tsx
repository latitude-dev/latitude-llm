import { Popover, PopoverAnchor } from "@repo/ui"
import { useRef } from "react"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationPopoverContent, AnnotationPopoverWrapper } from "./annotation-popover-content.tsx"

export interface AnnotationPopoverProps {
  readonly position: { x: number; y: number } | null
  readonly projectId: string
  readonly annotations: readonly AnnotationRecord[]
  readonly showCreateForm?: boolean
  readonly isCreateLoading?: boolean
  readonly isUpdateLoading?: boolean
  readonly onSave: (data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onUpdate: (annotationId: string, data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onClose: () => void
}

export function AnnotationPopover({
  position,
  projectId,
  annotations,
  showCreateForm = true,
  isCreateLoading = false,
  isUpdateLoading = false,
  onSave,
  onUpdate,
  onClose,
}: AnnotationPopoverProps) {
  const lastAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  if (position !== null) {
    lastAnchorRef.current = position
  }
  const anchorPoint = position ?? lastAnchorRef.current

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose()
    }
  }

  return (
    <Popover open={position !== null} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <span
          style={{
            position: "fixed",
            left: anchorPoint.x,
            top: anchorPoint.y,
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        />
      </PopoverAnchor>

      <AnnotationPopoverWrapper data-selection-popover sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()}>
        <AnnotationPopoverContent
          projectId={projectId}
          annotations={annotations}
          showCreateForm={showCreateForm}
          isCreateLoading={isCreateLoading}
          isUpdateLoading={isUpdateLoading}
          onSave={onSave}
          onUpdate={onUpdate}
          onDelete={onClose}
        />
      </AnnotationPopoverWrapper>
    </Popover>
  )
}
