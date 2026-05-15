import { Button, CloseTrigger, FormWrapper, Input, Modal, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { setActiveOrganization } from "../../../domains/auth/auth.functions.ts"
import { createOrganization } from "../../../domains/organizations/organizations.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../lib/form-server-action.ts"

interface CreateOrganizationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationModal({ open, onOpenChange }: CreateOrganizationModalProps) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const org = await createOrganization({ data: { name: value.name } })
        await setActiveOrganization({
          data: { organizationId: org.id, organizationSlug: org.slug },
        })
        return org
      },
      {
        onSuccess: async () => {
          toast({ description: "Organization created" })
          onOpenChange(false)
          window.location.href = "/"
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onOpenChange}
      title="Create Organization"
      description="Create a new organization to manage your projects and team members."
      footer={
        <>
          <CloseTrigger />
          <Button form="create-organization-form" type="submit" disabled={form.state.isSubmitting}>
            Create
          </Button>
        </>
      }
    >
      <form
        id="create-organization-form"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FormWrapper>
          <form.Field name="name">
            {(field) => (
              <Input
                required
                type="text"
                label="Organization Name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
                placeholder="My Organization"
              />
            )}
          </form.Field>
        </FormWrapper>
      </form>
    </Modal>
  )
}
