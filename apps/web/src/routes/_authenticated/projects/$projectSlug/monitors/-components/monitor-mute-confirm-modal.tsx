import { Button, Modal } from "@repo/ui"
import { type MonitorRecord, useMonitorMuteAction } from "../../../../../../domains/monitors/monitors.collection.ts"

/**
 * Confirmation modal for mute/unmute, shared by the dashboard 3-dots menu and
 * the details panel. Open when `monitor` is non-null; `onOpenChange(null)`
 * closes it. The verb flips on the monitor's current `mutedAt`.
 */
export function MonitorMuteConfirmModal({
  projectId,
  monitor,
  onOpenChange,
}: {
  readonly projectId: string
  readonly monitor: MonitorRecord | null
  readonly onOpenChange: (monitor: MonitorRecord | null) => void
}) {
  const { setMuted, isPending } = useMonitorMuteAction(projectId)
  const muted = monitor?.mutedAt != null

  const onConfirm = async () => {
    if (!monitor) return
    try {
      await setMuted(monitor, !muted)
      onOpenChange(null)
    } catch {
      // Error toast is handled in the hook; keep the modal open to retry.
    }
  }

  return (
    <Modal
      open={monitor !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(null)
      }}
      title={muted ? "Unmute monitor" : "Mute monitor"}
      description={
        muted
          ? "Notifications will resume for new incidents this monitor creates."
          : "This monitor will keep creating incidents, but it will stop sending notifications."
      }
      dismissible
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(null)}>
            Cancel
          </Button>
          <Button disabled={isPending} isLoading={isPending} onClick={() => void onConfirm()}>
            {muted ? "Unmute" : "Mute"}
          </Button>
        </div>
      }
    />
  )
}
