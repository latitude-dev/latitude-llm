import { Button, Modal, useToast } from "@repo/ui"
import { useMonitorAlertActions } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

/**
 * Confirm removal of a single alert from a user monitor (soft delete — the
 * monitor stops firing on it while its incident history stays attributable).
 * Mounted only while open.
 */
export function MonitorAlertDeleteConfirmModal({
  projectId,
  monitorId,
  alert,
  onClose,
}: {
  readonly projectId: string
  readonly monitorId: string
  readonly alert: MonitorAlertRecord
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const { removeAlert } = useMonitorAlertActions(projectId)

  const onConfirm = async () => {
    try {
      await removeAlert.mutateAsync({ monitorId, alertId: alert.id })
      toast({ description: "Alert removed." })
      onClose()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Remove alert"
      description="The monitor will stop firing on this condition. Existing incidents will stay in your history"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={removeAlert.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={removeAlert.isPending}
            isLoading={removeAlert.isPending}
            onClick={() => void onConfirm()}
          >
            Remove
          </Button>
        </div>
      }
    />
  )
}
