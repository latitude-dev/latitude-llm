import type { Organization } from "@domain/organizations"
import { Button, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useMembersCollection } from "../../../../../domains/members/members.collection.ts"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../../../../domains/organizations/organizations.collection.ts"
import { deleteOrganization } from "../../../../../domains/organizations/organizations.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { useAuthenticatedOrganizationId, useAuthenticatedUser } from "../../../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/organization")({
  component: OrganizationSettingsPage,
})

function OrganizationNameSection() {
  const organizationId = useAuthenticatedOrganizationId()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )

  if (!org) return null
  return <OrganizationNameForm org={org} />
}

function OrganizationNameForm({ org }: { org: Organization }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: { name: org.name },
    onSubmit: createFormSubmitHandler(
      async ({ name }) => {
        const trimmed = name.trim()
        const transaction = updateOrganizationMutation(org.id, { name: trimmed })
        await transaction.isPersisted.promise
      },
      {
        resetOnSuccess: false,
        onSuccess: () => {
          toast({ description: "Organization name updated" })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <Input
            key={org.id}
            type="text"
            name={field.name}
            label="Organization name"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder="Organization name"
            aria-label="Organization name"
          />
        )}
      </form.Field>
      <div className="self-start">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isLoading={isSubmitting}>
              Save
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

/**
 * Danger zone for permanently deleting the organization. Only shown to the org
 * `owner`; the delete is additionally gated server-side on the caller being the
 * owner and the sole member. The button stays disabled (with an explanation)
 * until every other member has been removed.
 */
function DeleteOrganizationSection() {
  const organizationId = useAuthenticatedOrganizationId()
  const user = useAuthenticatedUser()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const { data: memberData } = useMembersCollection()
  const [open, setOpen] = useState(false)

  const members = memberData ?? []
  const activeMembers = members.filter((member) => member.status === "active")
  const myMembership = activeMembers.find((member) => member.userId === user.id)
  const isOwner = myMembership?.role === "owner"
  // Pending invitations cascade away with the org, so only active members block.
  const isSoleMember = activeMembers.length === 1

  if (!org || !isOwner) return null

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <Text.H4 weight="bold" color="destructive">
        Delete Organization
      </Text.H4>
      <Text.H5 color="destructive">
        Permanently delete this organization and all of its projects and data. This action cannot be undone.
      </Text.H5>
      {!isSoleMember && (
        <Text.H5 color="foregroundMuted">Remove all other members before you can delete this organization.</Text.H5>
      )}
      <div>
        <DeleteOrganizationConfirmModal open={open} setOpen={setOpen} orgId={org.id} orgName={org.name} />
        <Button variant="destructive" disabled={!isSoleMember} onClick={() => setOpen(true)}>
          Delete Organization
        </Button>
      </div>
    </div>
  )
}

function DeleteOrganizationConfirmModal({
  open,
  setOpen,
  orgId,
  orgName,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  orgId: string
  orgName: string
}) {
  const { toast } = useToast()
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const expectedText = "delete my organization"
  const isConfirmed = confirmText.toLowerCase() === expectedText

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteOrganization({ data: { id: orgId } })
      toast({ description: `Organization "${orgName}" has been deleted.` })
      // Full navigation to /welcome: its loader re-resolves the user's remaining
      // orgs and either auto-activates the last one, shows a picker, or prompts
      // to create one — which also clears the now-stale active org.
      window.location.href = "/welcome"
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsDeleting(false)
    }
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmText("")
        setOpen(v)
      }}
      title="Delete Organization"
      description={`This action is permanent and cannot be undone. The organization "${orgName}" and all of its projects and data will be deleted.`}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!isConfirmed || isDeleting} onClick={() => void handleDelete()}>
            {isDeleting ? "Deleting..." : "Delete Organization"}
          </Button>
        </>
      }
    >
      <FormWrapper>
        <Input
          type="text"
          label={`Type "${expectedText}" to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={expectedText}
        />
      </FormWrapper>
    </Modal>
  )
}

function OrganizationSettingsPage() {
  return (
    <SettingsPage title="Organization" description="Manage your organization details">
      <div className="flex w-full flex-col gap-6 @[800px]:w-1/2">
        <OrganizationNameSection />
        <DeleteOrganizationSection />
      </div>
    </SettingsPage>
  )
}
