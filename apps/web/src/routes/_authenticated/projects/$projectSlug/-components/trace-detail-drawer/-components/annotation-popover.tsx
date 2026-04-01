import { Button, Popover, PopoverAnchor, PopoverContent, Text } from "@repo/ui"
import { TrashIcon } from "lucide-react"
import { useRef, useState } from "react"
import { AnnotationForm } from "./annotation-form.tsx"

export interface AnnotationPopoverProps {
  position: { x: number; y: number } | null
  passed: boolean | null
  comment: string
  issueId: string | null
  projectId: string
  /** true = draft (editable), false = published (read-only). */
  isEditable: boolean
  isExisting?: boolean | undefined
  isLoading?: boolean | undefined
  onPassedChange: (passed: boolean) => void
  onCommentChange: (comment: string) => void
  onIssueChange: (issueId: string | null) => void
  onConfirm: () => void
  onDelete: () => void
  onClose: () => void
}

export function AnnotationPopover({
  position,
  passed,
  comment,
  issueId,
  projectId,
  isEditable,
  isExisting = false,
  isLoading = false,
  onPassedChange,
  onCommentChange,
  onIssueChange,
  onConfirm,
  onDelete,
  onClose,
}: AnnotationPopoverProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const lastAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  if (position !== null) {
    lastAnchorRef.current = position
  }
  const anchorPoint = position ?? lastAnchorRef.current

  function handleOpenChange(open: boolean) {
    if (!open) {
      setConfirmingDelete(false)
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

      <PopoverContent
        data-selection-popover
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-96 flex flex-col gap-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {confirmingDelete ? (
          <>
            <Text.H6 color="foregroundMuted">Delete this annotation? This cannot be undone.</Text.H6>
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" isLoading={isLoading} onClick={onDelete}>
                Delete
              </Button>
              <Button variant="ghost" size="sm" disabled={isLoading} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : isEditable ? (
          <div className="relative">
            {isExisting && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setConfirmingDelete(true)}
                className="absolute top-0 right-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
            <AnnotationForm
              projectId={projectId}
              passed={passed}
              comment={comment}
              issueId={issueId}
              isLoading={isLoading}
              onPassedChange={onPassedChange}
              onCommentChange={onCommentChange}
              onIssueChange={onIssueChange}
              onConfirm={onConfirm}
              onCancel={onClose}
            />
          </div>
        ) : (
          <>
            {comment.trim() && <Text.H6 color="foregroundMuted">{comment.trim()}</Text.H6>}
            {isExisting && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setConfirmingDelete(true)}
                className="self-start rounded-md p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
