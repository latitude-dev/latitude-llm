import type { MonitorTarget } from "@domain/monitors"
import { Button, CloseTrigger, Modal, useToast } from "@repo/ui"
import { useState } from "react"
import { useMonitorRuleActions } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRuleRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { extractFieldErrors, toUserMessage } from "../../../../../../lib/errors.ts"
import { AlertCardForm } from "./alert-card-form.tsx"
import {
  type AlertDraft,
  type AlertFieldErrors,
  alertFieldErrorsFrom,
  draftToCondition,
  hasAlertFieldErrors,
  recordToAlertDraft,
} from "./alert-form-helpers.ts"

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
  const [errors, setErrors] = useState<AlertFieldErrors>({})
  const targetMode = draft.target !== null

  const onChange = (next: AlertDraft) => {
    setDraft(next)
    setErrors({})
  }

  const onSubmit = async () => {
    if (!targetMode && draft.sourceId === null) {
      setErrors({ source: ["Select a saved search"] })
      return
    }
    try {
      await editRule.mutateAsync({
        monitorId,
        kind: draft.kind,
        ...(targetMode ? {} : { source: { type: "savedSearch" as const, id: draft.sourceId } }),
        condition: draftToCondition(draft),
        severity: draft.severity,
      })
      toast({ description: "Monitor updated." })
      onClose()
    } catch (error) {
      const fieldErrors = alertFieldErrorsFrom(extractFieldErrors(error), null)
      if (hasAlertFieldErrors(fieldErrors)) {
        setErrors(fieldErrors)
        return
      }
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
      description="Update the conditions this monitor opens incidents on"
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
        onChange={onChange}
        projectId={projectId}
        projectSlug={projectSlug}
        errors={errors}
        metricReadonly
      />
    </Modal>
  )
}
