import { Button, CloseTrigger, FormWrapper, Input, Modal, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { setActiveOrganization } from "../../../domains/auth/auth.functions.ts"
import { createOrganization } from "../../../domains/organizations/organizations.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"

export function CreateOrganizationModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      try {
        const org = await createOrganization({ data: { name: value.name } })
        toast({ description: "Organization created" })
        form.reset()
        await setActiveOrganization({
          data: { organizationId: org.id, organizationSlug: org.slug },
        })
        onOpenChange(false)
        window.location.href = "/"
      } catch (error) {
        toast({ variant: "destructive", description: toUserMessage(error) })
      }
    },
  })

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content dismissible>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <Modal.Header
            title="Create Organization"
            description="Create a new organization to manage your projects and team members."
          />
          <Modal.Body>
            <FormWrapper>
              <form.Field name="name">
                {(field) => (
                  <Input
                    required
                    type="text"
                    label="Organization Name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="My Organization"
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" disabled={form.state.isSubmitting}>
              Create
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}
