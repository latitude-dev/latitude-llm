import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useCallback, useState } from "react"
import { deleteAnnotationQueueMutation } from "../../../../../../domains/annotation-queues/annotation-queues.collection.ts"
import type { AnnotationQueueRecord } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

interface DeleteQueueModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly projectId: string
  readonly queue: AnnotationQueueRecord
  readonly onSuccess: () => void
}

export function DeleteQueueModal({ open, onOpenChange, projectId, queue, onSuccess }: DeleteQueueModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const pendingItems = Math.max(0, queue.totalItems - queue.completedItems)

  const handleDelete = useCallback(async () => {
    setSubmitting(true)
    try {
      await deleteAnnotationQueueMutation(projectId, queue.id)

      toast({
        title: "Queue deleted",
        description: "Annotation queue has been deleted successfully.",
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: toUserMessage(error),
      })
    } finally {
      setSubmitting(false)
    }
  }, [projectId, queue.id, toast, onSuccess, onOpenChange])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Annotation Queue"
      dismissible
      footer={
        <>
          <CloseTrigger />
          <Button variant="destructive" onClick={handleDelete} isLoading={submitting}>
            Delete
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Alert
          variant="destructive"
          title={`Are you sure you want to delete "${queue.name}"?`}
          description="This will remove the queue and all its items from view. This action cannot be undone."
        />

        <div className="flex flex-col gap-2 rounded-md border p-3">
          <Text.H5 weight="medium">Queue statistics</Text.H5>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Text.H6 color="foregroundMuted">Total items</Text.H6>
              <Text.H6>{queue.totalItems}</Text.H6>
            </div>
            <div className="flex items-center justify-between">
              <Text.H6 color="foregroundMuted">Completed</Text.H6>
              <Text.H6>{queue.completedItems}</Text.H6>
            </div>
            <div className="flex items-center justify-between">
              <Text.H6 color="foregroundMuted">Pending</Text.H6>
              <Text.H6>{pendingItems}</Text.H6>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
