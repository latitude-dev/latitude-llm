import type { MonitorTarget } from "@domain/monitors"
import { Button, CloseTrigger, Modal, useToast } from "@repo/ui"
import { useState } from "react"
import { useMonitorRuleActions } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRuleRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { AlertCardForm } from "./alert-card-form.tsx"
import { type AlertDraft, recordToAlertDraft } from "./alert-form-helpers.ts"

export function MonitorRuleEditModal({
  projectId,
  projectSlug,
  monitorId,
  rule,
  target,
  onClose,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly monitorId: string
  readonly rule: MonitorRuleRecord
  readonly target?: MonitorTarget | null
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const { editRule } = useMonitorRuleActions(projectId)
  const [draft, setDraft] = useState<AlertDraft>(() => recordToAlertDraft(rule, target))

  const onSubmit = async () => {
    try {
      await editRule.mutateAsync({
        monitorId,
        severity: draft.severity,
      })
      toast({ description: "Monitor updated." })
      onClose()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open
      dismissible
      size="large"
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Edit monitor"
      description="Update the severity assigned to incidents this monitor opens"
      footer={
        <>
          <CloseTrigger />
          <Button disabled={editRule.isPending} isLoading={editRule.isPending} onClick={() => void onSubmit()}>
            Save
          </Button>
        </>
      }
    >
      <AlertCardForm
        value={draft}
        onChange={setDraft}
        projectId={projectId}
        projectSlug={projectSlug}
        metricReadonly
        conditionsReadonly
      />
    </Modal>
  )
}
