import { ThumbsDownIcon, ThumbsUpIcon, TrashIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "../../utils/cn.ts"
import { Button } from "../button/button.tsx"
import { Popover, PopoverAnchor, PopoverContent } from "../popover/primitives.tsx"
import { Text } from "../text/text.tsx"
import { Textarea } from "../textarea/textarea.tsx"

export interface AnnotationPopoverProps {
  /**
   * Viewport-relative coordinates where the popover anchor should appear.
   * When null the popover is closed.
   */
  position: { x: number; y: number } | null
  /** null means no thumb selected yet (only valid in editable mode). */
  passed: boolean | null
  comment: string
  /** true = draft (editable), false = published (read-only). */
  isEditable: boolean
  /** true when editing/viewing an existing annotation (shows trash icon). */
  isExisting?: boolean | undefined
  isLoading?: boolean | undefined
  onPassedChange: (passed: boolean) => void
  onCommentChange: (comment: string) => void
  onConfirm: () => void
  onDelete: () => void
  onClose: () => void
}

export function AnnotationPopover({
  position,
  passed,
  comment,
  isEditable,
  isExisting = false,
  isLoading = false,
  onPassedChange,
  onCommentChange,
  onConfirm,
  onDelete,
  onClose,
}: AnnotationPopoverProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleOpenChange(open: boolean) {
    if (!open) {
      setConfirmingDelete(false)
      onClose()
    }
  }

  return (
    <Popover open={position !== null} onOpenChange={handleOpenChange}>
      {/* Zero-size fixed anchor positioned at the selection/click coordinates */}
      <PopoverAnchor asChild>
        <span
          style={{
            position: "fixed",
            left: position?.x ?? 0,
            top: position?.y ?? 0,
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
        ) : (
          <>
            {/* Thumb buttons + trash */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!isEditable || isLoading}
                onClick={() => onPassedChange(true)}
                className={cn(
                  "flex items-center rounded-md px-2 py-1 text-sm transition-colors",
                  passed === true
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-muted",
                  (!isEditable || isLoading) && "cursor-default opacity-60",
                )}
              >
                <ThumbsUpIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!isEditable || isLoading}
                onClick={() => onPassedChange(false)}
                className={cn(
                  "flex items-center rounded-md px-2 py-1 text-sm transition-colors",
                  passed === false
                    ? "bg-red-100 text-red-700 dark:bg-red-400/20 dark:text-red-400"
                    : "text-muted-foreground hover:bg-muted",
                  (!isEditable || isLoading) && "cursor-default opacity-60",
                )}
              >
                <ThumbsDownIcon className="h-4 w-4" />
              </button>
              {isExisting && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setConfirmingDelete(true)}
                  className="ml-auto rounded-md p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Comment */}
            {isEditable ? (
              <Textarea
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                placeholder="Add a comment... (optional)"
                disabled={isLoading}
                rows={3}
              />
            ) : comment.trim() ? (
              <Text.H6 color="foregroundMuted">{comment.trim()}</Text.H6>
            ) : null}

            {/* Footer */}
            {isEditable && (
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={passed === null || isLoading} isLoading={isLoading} onClick={onConfirm}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" disabled={isLoading} onClick={onClose}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
