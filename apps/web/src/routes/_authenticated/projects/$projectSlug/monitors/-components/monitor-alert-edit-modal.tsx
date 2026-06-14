import type { MonitorTarget } from "@domain/monitors"
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
  draftToCondition,
  hasAlertFieldErrors,
  recordToAlertDraft,
} from "./alert-form-helpers.ts"

/**
 * Edit an existing alert in place. Alerts are never added or deleted from the app.
 * For unified (tool/user) monitors the `target` opens the form in target mode; the
 * metric is read-only (it's fixed on the monitor target at creation).
 */
export function MonitorAlertEditModal({
  projectId,
  projectSlug,
  monitorId,
  alert,
  target,
  onClose,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly monitorId: string
  readonly alert: MonitorAlertRecord
  readonly target?: MonitorTarget | null
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const { editAlert } = useMonitorAlertActions(projectId)
  const [draft, setDraft] = useState<AlertDraft>(() => recordToAlertDraft(alert, target))
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
      await editAlert.mutateAsync({
        monitorId,
        alertId: alert.id,
        kind: draft.kind,
        ...(targetMode ? {} : { source: { type: "savedSearch" as const, id: draft.sourceId } }),
        condition: draftToCondition(draft),
        severity: draft.severity,
      })
      toast({ description: "Alert updated." })
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
      title="Edit alert"
      description="Alerts define the conditions that should be met for monitors to open incidents"
      footer={
        <>
          <CloseTrigger />
          <Button disabled={editAlert.isPending} isLoading={editAlert.isPending} onClick={() => void onSubmit()}>
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
