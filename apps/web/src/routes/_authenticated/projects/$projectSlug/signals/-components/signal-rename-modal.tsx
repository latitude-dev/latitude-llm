import { Button, CloseTrigger, Input, Modal, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useUpdateSignal } from "../../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"

/**
 * Edit a user signal's name + description (the detector/scope live in the builder).
 * Mounted only while open so the form defaults reset per signal; renaming regenerates
 * the slug server-side and keeps the linked evaluation's name in sync.
 */
export function SignalRenameModal({
  projectId,
  signalId,
  name,
  description,
  onClose,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly name: string
  readonly description: string
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const update = useUpdateSignal(projectId, signalId)

  const form = useForm({
    defaultValues: { name, description },
    onSubmit: createFormSubmitHandler(
      async (value) => update.mutateAsync({ name: value.name.trim(), description: value.description.trim() }),
      {
        onSuccess: () => {
          toast({ description: "Signal updated." })
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
      title="Edit signal"
      description="Rename the signal or change its description"
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
