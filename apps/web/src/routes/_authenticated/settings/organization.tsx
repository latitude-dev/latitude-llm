import { Button, CloseTrigger, Container, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import { setActiveOrganization } from "../../../domains/auth/auth.functions.ts"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../../domains/organizations/organizations.collection.ts"
import { createOrganization } from "../../../domains/organizations/organizations.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { useAuthenticatedOrganizationId } from "../-route-data.ts"
import { SettingsPageHeader } from "./-components/settings-page-header.tsx"

export const Route = createFileRoute("/_authenticated/settings/organization")({
  component: OrganizationSettingsRoutePage,
})

function OrganizationSettingsRoutePage() {
  return <OrganizationSettingsPanel />
}

function OrganizationNameSection() {
  const organizationId = useAuthenticatedOrganizationId()
  const { toast } = useToast()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const saveField = useCallback(
    (name: string) => {
      if (!org) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const trimmed = name.trim()
        if (!trimmed) return
        updateOrganizationMutation(org.id, { name: trimmed })
        toast({ description: "Organization name updated" })
      }, 600)
    },
    [org, toast],
  )

  if (!org) return null

  return (
    <Input
      required
      type="text"
      label="Name"
      defaultValue={org.name}
      onChange={(e) => saveField(e.target.value)}
      placeholder="Organization name"
    />
  )
}

function CreateOrganizationModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
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
        setOpen(false)
        window.location.href = "/"
      } catch (error) {
        toast({ variant: "destructive", description: toUserMessage(error) })
      }
    },
  })

  return (
    <Modal.Root open={open} onOpenChange={setOpen}>
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

function CreateOrganizationSection() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-6">
      <Text.H4 weight="bold" color="primary">
        Create Organization
      </Text.H4>
      <Text.H5 color="primary">Create a new organization to manage your projects and team members.</Text.H5>
      <CreateOrganizationModal open={modalOpen} setOpen={setModalOpen} />
      <div>
        <Button onClick={() => setModalOpen(true)}>Create Organization</Button>
      </div>
    </div>
  )
}

export function OrganizationSettingsPanel() {
  return (
    <Container className="flex flex-col gap-8 p-6">
      <SettingsPageHeader title="Organization" description="Manage your organization details." />
      <div className="flex max-w-lg flex-col gap-6">
        <OrganizationNameSection />
      </div>
      <CreateOrganizationSection />
    </Container>
  )
}
