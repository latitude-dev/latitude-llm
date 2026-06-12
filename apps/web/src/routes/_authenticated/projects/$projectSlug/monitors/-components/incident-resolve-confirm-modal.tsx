import { Button, Modal } from "@repo/ui"
import { useIncidentResolveAction } from "../../../../../../domains/monitors/monitors.collection.ts"

/**
 * Confirmation modal for resolving an ongoing incident, shared by the
 * dashboard "Last incident" pill and the details-panel incidents table. Open
 * when `incidentId` is non-null; `onOpenChange(null)` closes it.
 */
export function IncidentResolveConfirmModal({
  projectId,
  incidentId,
  onOpenChange,
}: {
  readonly projectId: string
  readonly incidentId: string | null
  readonly onOpenChange: (incidentId: string | null) => void
}) {
  const { resolve, isPending } = useIncidentResolveAction(projectId)

  const onConfirm = async () => {
    if (!incidentId) return
    try {
      await resolve(incidentId)
      onOpenChange(null)
    } catch {
      // Error toast is handled in the hook; keep the modal open to retry.
    }
  }

  return (
    <Modal
      open={incidentId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(null)
      }}
      title="Resolve incident"
      description="The incident will be closed and marked as resolved. If its condition triggers again, a new incident will be created."
      dismissible
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(null)}>
            Cancel
          </Button>
          <Button disabled={isPending} isLoading={isPending} onClick={() => void onConfirm()}>
            Resolve
          </Button>
        </div>
      }
    />
  )
}
