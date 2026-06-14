import { Button, CloseTrigger, Input, Modal, Textarea, useToast } from "@repo/ui"
import { useState } from "react"
import { monitorTargetName } from "../../../../../../domains/monitors/monitor-target.ts"
import { useCreateMonitor } from "../../../../../../domains/monitors/monitors.collection.ts"
import { extractFieldErrors, toUserMessage } from "../../../../../../lib/errors.ts"
import { AlertCardForm } from "./alert-card-form.tsx"
import {
  type AlertDraft,
  type AlertFieldErrors,
  alertFieldErrorsFrom,
  draftToAlertDraft,
  draftToTarget,
  emptyAlertDraft,
  hasAlertFieldErrors,
} from "./alert-form-helpers.ts"

/**
 * Create a user monitor end-to-end: name + description + its alert. The UI
 * treats a monitor as having exactly one alert (the data model still allows
 * more, but nothing promotes it). Mounted only while open (fresh state per
 * open). On success it closes and, when `onCreated` is given, hands the new
 * slug back (e.g. so the monitors page can open its details panel); callers
 * that stay put omit it.
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
  readonly onCreated?: (slug: string) => void
}) {
  const { toast } = useToast()
  const create = useCreateMonitor(projectId)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [alert, setAlert] = useState<AlertDraft>(initialAlert ?? emptyAlertDraft())
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [alertErrors, setAlertErrors] = useState<AlertFieldErrors>({})

  const targetName = alert.target ? monitorTargetName(alert.target) : null
  const modalDescription = targetName
    ? `This monitor watches ${targetName} and opens an incident when its condition is met.`
    : "Monitors watch your saved searches and open incidents when their alert conditions are met."

  const onAlertChange = (next: AlertDraft) => {
    setAlert(next)
    setAlertErrors({})
  }

  const onSubmit = async () => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setNameError("Name is required")
      return
    }
    if (alert.target === null && alert.sourceId === null) {
      setAlertErrors({ source: ["Select a saved search"] })
      return
    }
    const target = draftToTarget(alert)
    try {
      const monitor = await create.mutateAsync({
        name: trimmedName,
        ...(description.trim() ? { description: description.trim() } : {}),
        alerts: [draftToAlertDraft(alert)],
        ...(target ? { target } : {}),
      })
      toast({ description: "Monitor created." })
      onClose()
      onCreated?.(monitor.slug)
    } catch (error) {
      // Surface Zod field errors under the offending control; toast non-field errors.
      const fieldErrors = extractFieldErrors(error)
      const nameErr = fieldErrors?.name?.[0]
      const errors = alertFieldErrorsFrom(fieldErrors, 0)
      if (nameErr || hasAlertFieldErrors(errors)) {
        if (nameErr) setNameError(nameErr)
        setAlertErrors(errors)
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
      description={modalDescription}
      footer={
        <>
          <CloseTrigger />
          <Button disabled={create.isPending} isLoading={create.isPending} onClick={() => void onSubmit()}>
            {create.isPending ? "Creating" : "Create monitor"}
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
        <AlertCardForm
          value={alert}
          onChange={onAlertChange}
          projectId={projectId}
          projectSlug={projectSlug}
          errors={alertErrors}
        />
      </div>
    </Modal>
  )
}
