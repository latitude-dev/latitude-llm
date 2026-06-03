import { Button, CloseTrigger, Input, Modal, Text, Textarea, useToast } from "@repo/ui"
import { useState } from "react"
import { useCreateMonitor } from "../../../../../../domains/monitors/monitors.collection.ts"
import { extractFieldErrors, toUserMessage } from "../../../../../../lib/errors.ts"
import { AddAlertButton } from "./add-alert-button.tsx"
import { AlertCardForm } from "./alert-card-form.tsx"
import {
  type AlertDraft,
  type AlertFieldErrors,
  alertFieldErrorsFrom,
  draftToAlertDraft,
  emptyAlertDraft,
  hasAlertFieldErrors,
} from "./alert-form-helpers.ts"

/**
 * Create a user monitor end-to-end: name + description + one or more alerts.
 * Mounted only while open (fresh state per open). On success it closes and
 * hands the new slug back so the page can open its details panel.
 */
export function MonitorCreateModal({
  projectId,
  projectSlug,
  initialAlert,
  onClose,
  onCreated,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly initialAlert?: AlertDraft
  readonly onClose: () => void
  readonly onCreated: (slug: string) => void
}) {
  const { toast } = useToast()
  const create = useCreateMonitor(projectId)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [alerts, setAlerts] = useState<readonly AlertDraft[]>([initialAlert ?? emptyAlertDraft()])
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  // Per-alert field errors, aligned with `alerts` by index. Cleared on edit.
  const [alertErrors, setAlertErrors] = useState<readonly AlertFieldErrors[]>([])

  const updateAlert = (index: number, next: AlertDraft) => {
    setAlerts((prev) => prev.map((alert, i) => (i === index ? next : alert)))
    setAlertErrors((prev) => prev.map((errors, i) => (i === index ? {} : errors)))
  }
  const addAlert = () => setAlerts((prev) => [...prev, emptyAlertDraft()])
  const removeAlert = (index: number) => {
    setAlerts((prev) => prev.filter((_, i) => i !== index))
    setAlertErrors((prev) => prev.filter((_, i) => i !== index))
  }

  const onSubmit = async () => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setNameError("Name is required")
      return
    }
    if (alerts.some((alert) => alert.sourceId === null)) {
      setAlertErrors(alerts.map((alert) => (alert.sourceId === null ? { source: ["Select a saved search"] } : {})))
      return
    }
    try {
      const monitor = await create.mutateAsync({
        name: trimmedName,
        ...(description.trim() ? { description: description.trim() } : {}),
        alerts: alerts.map(draftToAlertDraft),
      })
      toast({ description: "Monitor created." })
      onClose()
      onCreated(monitor.slug)
    } catch (error) {
      // Surface Zod field errors under the offending control; toast non-field errors.
      const fieldErrors = extractFieldErrors(error)
      const nameErr = fieldErrors?.name?.[0]
      const perAlert = alerts.map((_, i) => alertFieldErrorsFrom(fieldErrors, i))
      if (nameErr || perAlert.some(hasAlertFieldErrors)) {
        if (nameErr) setNameError(nameErr)
        setAlertErrors(perAlert)
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
      title="New monitor"
      description="Monitors watch your issues and searches and open incidents when their alert conditions are met"
      footer={
        <>
          <CloseTrigger />
          <Button disabled={create.isPending} isLoading={create.isPending} onClick={() => void onSubmit()}>
            Create monitor
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          required
          autoFocus
          label="Name"
          placeholder="Tool error spikes"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (nameError) setNameError(undefined)
          }}
          {...(nameError ? { errors: [nameError] } : {})}
        />
        <Textarea
          label="Description"
          placeholder="What is this monitor for?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minRows={2}
        />

        <div className="flex flex-col gap-3">
          <Text.H5M>Alerts</Text.H5M>
          {alerts.map((alert, index) => (
            // The card list is controlled (state lifted here), so positional keys are safe;
            // drafts have no stable id until the monitor is created.
            <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <AlertCardForm
                value={alert}
                onChange={(next) => updateAlert(index, next)}
                projectId={projectId}
                projectSlug={projectSlug}
                {...(alerts.length > 1 ? { onRemove: () => removeAlert(index) } : {})}
                {...(alertErrors[index] ? { errors: alertErrors[index] } : {})}
              />
            </div>
          ))}
          <AddAlertButton onClick={addAlert} />
        </div>
      </div>
    </Modal>
  )
}
