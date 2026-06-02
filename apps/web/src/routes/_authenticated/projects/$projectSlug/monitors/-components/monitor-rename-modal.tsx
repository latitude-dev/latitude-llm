import { Button, CloseTrigger, Input, Modal, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useUpdateMonitor } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"

/**
 * Edit a user monitor's name + description. Mounted only while open (so the form
 * defaults reset per target). Renaming regenerates the slug server-side.
 */
export function MonitorRenameModal({
  projectId,
  monitor,
  onClose,
}: {
  readonly projectId: string
  readonly monitor: MonitorRecord
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const update = useUpdateMonitor(projectId)

  const form = useForm({
    defaultValues: { name: monitor.name, description: monitor.description },
    onSubmit: createFormSubmitHandler(
      async (value) =>
        update.mutateAsync({ monitorId: monitor.id, name: value.name.trim(), description: value.description.trim() }),
      {
        onSuccess: () => {
          toast({ description: "Monitor updated." })
          onClose()
        },
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
      },
    ),
  })

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Edit monitor"
      description="Rename the monitor's name or change its description"
      footer={
        <>
          <CloseTrigger />
          <Button type="submit" onClick={() => void form.handleSubmit()}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              required
              autoFocus
              label="Name"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Textarea
              label="Description"
              minRows={2}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
      </form>
    </Modal>
  )
}
