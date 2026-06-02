import { Button, Modal, Text, useToast } from "@repo/ui"
import { useDeleteMonitor } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

/**
 * Confirm deletion of a user monitor (soft delete — it stops firing and its
 * incident history stays attributable). Open when `monitor` is non-null.
 */
export function MonitorDeleteConfirmModal({
  projectId,
  monitor,
  onOpenChange,
  onDeleted,
}: {
  readonly projectId: string
  readonly monitor: MonitorRecord | null
  readonly onOpenChange: (monitor: MonitorRecord | null) => void
  readonly onDeleted?: (monitorId: string) => void
}) {
  const { toast } = useToast()
  const remove = useDeleteMonitor(projectId)

  const onConfirm = async () => {
    if (!monitor) return
    try {
      await remove.mutateAsync(monitor.id)
      toast({ description: "Monitor deleted." })
      onDeleted?.(monitor.id)
      onOpenChange(null)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open={monitor !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(null)
      }}
      title="Delete monitor"
      dismissible
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={remove.isPending} onClick={() => onOpenChange(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            isLoading={remove.isPending}
            onClick={() => void onConfirm()}
          >
            Delete
          </Button>
        </div>
      }
    >
      <Text.H5 color="foregroundMuted">
        {monitor ? (
          <>
            Delete <span className="font-medium text-foreground">{monitor.name}</span>? It will stop creating incidents.
            Existing incidents stay in your history.
          </>
        ) : null}
      </Text.H5>
    </Modal>
  )
}
