import { Button, CloseTrigger, Modal, useToast } from "@repo/ui"
import { useState } from "react"
import { useMonitorAlertActions } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { SENSITIVITY_DEFAULT, SensitivitySlider } from "./sensitivity-slider.tsx"

/**
 * Edit the system `issue.escalating` alert's sensitivity — the one configurable
 * value on a system monitor. Mounted only while open; saves via `updateMonitorAlert`.
 */
export function MonitorSensitivityEditModal({
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
  const { editAlert } = useMonitorAlertActions(projectId)
  const saved =
    alert.condition?.kind === "issue.escalating"
      ? (alert.condition.sensitivity ?? SENSITIVITY_DEFAULT)
      : SENSITIVITY_DEFAULT
  const [value, setValue] = useState(saved)

  const onSave = async () => {
    try {
      await editAlert.mutateAsync({
        monitorId,
        alertId: alert.id,
        condition: { kind: "issue.escalating", sensitivity: value },
      })
      toast({ description: "Sensitivity updated." })
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
      title="Edit sensitivity"
      description="Controls how the monitor flags escalating issues. Lower values trigger sooner but produce more false positives, higher values wait for stronger signal"
      footer={
        <>
          <CloseTrigger />
          <Button disabled={editAlert.isPending} isLoading={editAlert.isPending} onClick={() => void onSave()}>
            Save
          </Button>
        </>
      }
    >
      <SensitivitySlider value={value} onChange={setValue} />
    </Modal>
  )
}
