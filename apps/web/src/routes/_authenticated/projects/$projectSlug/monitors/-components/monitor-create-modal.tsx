import { Button, CloseTrigger, Icon, Input, Modal, Text, Textarea, useToast } from "@repo/ui"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useCreateMonitor } from "../../../../../../domains/monitors/monitors.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { AlertCardForm } from "./alert-card-form.tsx"
import { type AlertDraft, draftToAlertDraft, emptyAlertDraft } from "./alert-form-helpers.ts"

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

  const updateAlert = (index: number, next: AlertDraft) =>
    setAlerts((prev) => prev.map((alert, i) => (i === index ? next : alert)))
  const addAlert = () => setAlerts((prev) => [...prev, emptyAlertDraft()])
  const removeAlert = (index: number) => setAlerts((prev) => prev.filter((_, i) => i !== index))

  const onSubmit = async () => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setNameError("Name is required")
      return
    }
    if (alerts.some((alert) => alert.sourceId === null)) {
      toast({ variant: "destructive", description: "Select a saved search for every alert." })
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
      description="Monitors watch your saved searches and raise incidents when an alert's condition is met."
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
          placeholder="e.g. 5xx spikes"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (nameError) setNameError(undefined)
          }}
          {...(nameError ? { errors: [nameError] } : {})}
        />
        <Textarea
          label="Description"
          placeholder="Optional — what this monitor is for"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minRows={2}
        />

        <div className="flex flex-col gap-3">
          <Text.H6M>Alerts</Text.H6M>
          {alerts.map((alert, index) => (
            // The card list is controlled (state lifted here), so positional keys are safe;
            // drafts have no stable id until the monitor is created.
            <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              {alerts.length > 1 ? (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => removeAlert(index)}>
                    <Icon icon={Trash2Icon} size="sm" />
                    Remove
                  </Button>
                </div>
              ) : null}
              <AlertCardForm
                value={alert}
                onChange={(next) => updateAlert(index, next)}
                projectId={projectId}
                projectSlug={projectSlug}
              />
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" onClick={addAlert}>
              <Icon icon={PlusIcon} size="sm" />
              Add alert
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
