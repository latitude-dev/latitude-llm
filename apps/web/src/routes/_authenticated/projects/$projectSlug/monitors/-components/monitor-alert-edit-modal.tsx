import { Button, CloseTrigger, Modal, useToast } from "@repo/ui"
import { useState } from "react"
import { useMonitorAlertActions } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { extractFieldErrors, toUserMessage } from "../../../../../../lib/errors.ts"
import { AlertCardForm } from "./alert-card-form.tsx"
import {
  type AlertDraft,
  type AlertFieldErrors,
  alertFieldErrorsFrom,
  draftToAlertDraft,
  draftToCondition,
  emptyAlertDraft,
  hasAlertFieldErrors,
  recordToAlertDraft,
} from "./alert-form-helpers.ts"

/** Add a new saved-search alert (`alert == null`) or edit an existing one (`alert` set). */
export function MonitorAlertEditModal({
  projectId,
  projectSlug,
  monitorId,
  alert,
  onClose,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly monitorId: string
  readonly alert: MonitorAlertRecord | null
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const { addAlert, editAlert } = useMonitorAlertActions(projectId)
  const isEdit = alert !== null
  const [draft, setDraft] = useState<AlertDraft>(() => (alert ? recordToAlertDraft(alert) : emptyAlertDraft()))
  const [errors, setErrors] = useState<AlertFieldErrors>({})
  const pending = addAlert.isPending || editAlert.isPending

  const onChange = (next: AlertDraft) => {
    setDraft(next)
    setErrors({})
  }

  const onSubmit = async () => {
    if (draft.sourceId === null) {
      setErrors({ source: ["Select a saved search"] })
      return
    }
    try {
      if (alert) {
        await editAlert.mutateAsync({
          monitorId,
          alertId: alert.id,
          kind: draft.kind,
          source: { type: "savedSearch", id: draft.sourceId },
          condition: draftToCondition(draft),
          severity: draft.severity,
        })
      } else {
        await addAlert.mutateAsync({ monitorId, ...draftToAlertDraft(draft) })
      }
      toast({ description: isEdit ? "Alert updated." : "Alert added." })
      onClose()
    } catch (error) {
      // Surface Zod field errors under the offending control; toast non-field errors.
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
      title={isEdit ? "Edit alert" : "Add alert"}
      description="Alerts define the conditions that should be met for monitors to open incidents"
      footer={
        <>
          <CloseTrigger />
          <Button disabled={pending} isLoading={pending} onClick={() => void onSubmit()}>
            {isEdit ? "Save" : "Add alert"}
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
      />
    </Modal>
  )
}
