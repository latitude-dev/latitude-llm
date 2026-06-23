import { Button, CloseTrigger, Modal, useToast } from "@repo/ui"
import { useState } from "react"
import { useMonitorRuleActions } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRuleRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { SENSITIVITY_DEFAULT, SensitivitySlider } from "./sensitivity-slider.tsx"

export function MonitorSensitivityEditModal({
  projectId,
  monitorId,
  alert,
  onClose,
}: {
  readonly projectId: string
  readonly monitorId: string
  readonly alert: MonitorRuleRecord
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const { editRule } = useMonitorRuleActions(projectId)
  const threshold = alert.condition?.trigger === "escalating" ? alert.condition.threshold : undefined
  const saved = threshold?.mode === "expected" ? (threshold.sensitivity ?? SENSITIVITY_DEFAULT) : SENSITIVITY_DEFAULT
  const [value, setValue] = useState(saved)

  const onSave = async () => {
    try {
      await editRule.mutateAsync({
        monitorId,
        condition: {
          trigger: "escalating",
          metric: { kind: "count" },
          threshold: { mode: "expected", sensitivity: value },
        },
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
          <Button disabled={editRule.isPending} isLoading={editRule.isPending} onClick={() => void onSave()}>
            Save
          </Button>
        </>
      }
    >
      <SensitivitySlider value={value} onChange={setValue} />
    </Modal>
  )
}
