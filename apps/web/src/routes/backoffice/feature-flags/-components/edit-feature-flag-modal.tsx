import { Button, CloseTrigger, FormWrapper, Input, Modal, Text, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { type AdminFeatureFlagDto, adminUpdateFeatureFlag } from "../../../../domains/admin/feature-flags.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../lib/form-server-action.ts"

interface EditFeatureFlagModalProps {
  readonly featureFlag: AdminFeatureFlagDto
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function EditFeatureFlagModal({ featureFlag, open, onOpenChange }: EditFeatureFlagModalProps) {
  const router = useRouter()
  const { toast } = useToast()

  const form = useForm({
    defaultValues: { name: featureFlag.name ?? "", description: featureFlag.description ?? "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        return await adminUpdateFeatureFlag({
          data: {
            identifier: featureFlag.identifier,
            name: value.name.trim().length > 0 ? value.name : null,
            description: value.description.trim().length > 0 ? value.description : null,
          },
        })
      },
      {
        onSuccess: async (updated) => {
          toast({ description: `Updated "${updated.identifier}".` })
          onOpenChange(false)
          void router.invalidate()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Could not update feature flag",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  // Reset the form when reopening with a different flag.
  useEffect(() => {
    if (open) form.reset({ name: featureFlag.name ?? "", description: featureFlag.description ?? "" })
  }, [open, featureFlag.identifier, featureFlag.name, featureFlag.description, form])

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content dismissible size="large">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <Modal.Header
            title="Edit feature flag"
            description="Update the human-facing name and description. The identifier is fixed because code references it."
          />
          <Modal.Body>
            <FormWrapper>
              <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
                <Text.H6 color="foregroundMuted">Identifier (cannot be changed)</Text.H6>
                <code className="font-mono text-sm">{featureFlag.identifier}</code>
              </div>
              <form.Field name="name">
                {(field) => (
                  <Input
                    label="Name"
                    description="Optional human-facing label for Backoffice."
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="New dashboard"
                    autoComplete="off"
                  />
                )}
              </form.Field>
              <form.Field name="description">
                {(field) => (
                  <Textarea
                    label="Description"
                    description="Optional context for when staff should enable this flag."
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="What this flag enables and when staff should use it."
                    minRows={4}
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" size="sm" disabled={form.state.isSubmitting}>
              {form.state.isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}
