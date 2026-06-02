import { Button, CloseTrigger, Modal, useToast } from "@repo/ui"
import { useState } from "react"
import { useMonitorAlertActions } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { AlertCardForm } from "./alert-card-form.tsx"
import {
  type AlertDraft,
  draftToAlertDraft,
  draftToCondition,
  emptyAlertDraft,
  recordToAlertDraft,
} from "./alert-form-helpers.ts"

/**
 * Add a new saved-search alert (`alert == null`) or edit an existing one's
 * configurable values (`alert` set; kind is locked). Mounted only while open.
 * Saves through `createMonitorAlert` / `updateMonitorAlert`.
 */
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
  const pending = addAlert.isPending || editAlert.isPending

  const onSubmit = async () => {
    if (draft.sourceId === null) {
      toast({ variant: "destructive", description: "Select a saved search for this alert." })
      return
    }
    try {
      if (alert) {
        await editAlert.mutateAsync({
          monitorId,
          alertId: alert.id,
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
        onChange={setDraft}
        projectId={projectId}
        projectSlug={projectSlug}
        {...(isEdit ? { lockKind: true } : {})}
      />
    </Modal>
  )
}
