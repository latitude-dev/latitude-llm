/**
 * Shared inline editor for an existing annotation (draft or published).
 * Handles thumb toggle, comment editing, and deletion with confirmation modal.
 * Used at every annotation level: trace-level, message-level, and text-selection.
 */

import type { AnnotationAnchor } from "@domain/scores"
import { Button, cn, Modal, Text, Textarea } from "@repo/ui"
import { ThumbsDownIcon, ThumbsUpIcon, TrashIcon } from "lucide-react"
import { useState } from "react"
import {
  useDeleteAnnotation,
  useUpdateAnnotation,
} from "../../../../../../../domains/annotations/annotations.collection.ts"
import {
  type AnnotationRecord,
  isDraftAnnotation,
} from "../../../../../../../domains/annotations/annotations.functions.ts"

export function AnnotationEditor({
  annotation,
  projectId,
  traceId,
  anchor,
}: {
  readonly annotation: AnnotationRecord
  readonly projectId: string
  readonly traceId: string
  readonly anchor?: AnnotationAnchor | undefined
}) {
  const isEditable = isDraftAnnotation(annotation)
  const [localComment, setLocalComment] = useState(annotation.feedback?.trim() ?? "")
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  const updateMutation = useUpdateAnnotation()
  const deleteMutation = useDeleteAnnotation()
  const isLoading = updateMutation.isPending || deleteMutation.isPending

  const isDirty = localComment.trim() !== (annotation.feedback?.trim() ?? "")

  function handleSaveComment() {
    if (!isEditable || isLoading || !isDirty) return
    updateMutation.mutate({
      scoreId: annotation.id,
      projectId,
      traceId,
      value: annotation.value,
      passed: annotation.passed,
      feedback: localComment.trim() || " ",
      ...(anchor ? { anchor } : {}),
    })
  }

  function handleThumbClick(newPassed: boolean) {
    if (!isEditable || isLoading) return
    updateMutation.mutate({
      scoreId: annotation.id,
      projectId,
      traceId,
      value: newPassed ? 1 : 0,
      passed: newPassed,
      feedback: localComment.trim() || " ",
      ...(anchor ? { anchor } : {}),
    })
  }

  function handleDelete() {
    deleteMutation.mutate({ scoreId: annotation.id, projectId }, { onSuccess: () => setDeleteModalOpen(false) })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!isEditable || isLoading}
          onClick={() => handleThumbClick(true)}
          className={cn("flex items-center rounded-md p-1.5 transition-colors", {
            "text-emerald-600 bg-emerald-100 dark:bg-emerald-400/20": annotation.passed === true,
            "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20":
              annotation.passed !== true && isEditable,
            "text-muted-foreground cursor-default opacity-60": !isEditable,
          })}
        >
          <ThumbsUpIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={!isEditable || isLoading}
          onClick={() => handleThumbClick(false)}
          className={cn("flex items-center rounded-md p-1.5 transition-colors", {
            "text-red-600 bg-red-100 dark:bg-red-400/20": annotation.passed === false,
            "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20":
              annotation.passed !== false && isEditable,
            "text-muted-foreground cursor-default opacity-60": !isEditable,
          })}
        >
          <ThumbsDownIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => setDeleteModalOpen(true)}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {isEditable ? (
        <>
          <Textarea
            value={localComment}
            onChange={(e) => setLocalComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
          />
          {isDirty && (
            <div className="flex">
              <Button size="sm" isLoading={updateMutation.isPending} disabled={isLoading} onClick={handleSaveComment}>
                Save
              </Button>
            </div>
          )}
        </>
      ) : annotation.feedback?.trim() ? (
        <Text.H6 color="foregroundMuted">{annotation.feedback.trim()}</Text.H6>
      ) : null}

      <Modal
        dismissible
        size="small"
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete annotation"
        description={
          isEditable
            ? "Are you sure you want to delete this annotation?"
            : "This annotation has been published and cannot be recovered after deletion."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" isLoading={deleteMutation.isPending} onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  )
}
