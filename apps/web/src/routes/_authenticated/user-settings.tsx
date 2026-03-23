import { Button, Container, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { createOrganization } from "../../domains/organizations/organizations.functions.ts"
import { deleteCurrentUser, updateUserName } from "../../domains/sessions/session.functions.ts"
import { authClient } from "../../lib/auth-client.ts"
import { toUserMessage } from "../../lib/errors.ts"

export const Route = createFileRoute("/_authenticated/user-settings")({
  component: UserSettingsPage,
})

// --- Profile Section ---

function ProfileSection() {
  const { user } = Route.useRouteContext()
  const { toast } = useToast()
  const router = useRouter()

  const form = useForm({
    defaultValues: {
      name: user.name ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        await updateUserName({ data: { name: value.name } })
        toast({ description: "Name updated" })
        void router.invalidate()
      } catch (error) {
        toast({
          variant: "destructive",
          description: toUserMessage(error),
        })
      }
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Text.H4 weight="bold">Profile</Text.H4>
      <form
        className="flex flex-row items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              type="text"
              label="Your Name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="Your name"
            />
          )}
        </form.Field>
        <Button type="submit" disabled={form.state.isSubmitting}>
          Save
        </Button>
      </form>
    </div>
  )
}

// --- Create Organization Section ---

function CreateOrganizationSection() {
  const { toast } = useToast()
  const router = useRouter()

  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      try {
        await createOrganization({ data: { name: value.name } })
        toast({ description: "Organization created" })
        form.reset()
        void router.invalidate()
      } catch (error) {
        toast({
          variant: "destructive",
          description: toUserMessage(error),
        })
      }
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Text.H4 weight="bold">Create Organization</Text.H4>
      <form
        className="flex flex-row items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
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
        <Button type="submit" disabled={form.state.isSubmitting}>
          Create
        </Button>
      </form>
    </div>
  )
}

// --- Delete Account Section ---

function DeleteAccountConfirmModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()
  const router = useRouter()
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const expectedText = "delete my account"
  const isConfirmed = confirmText.toLowerCase() === expectedText

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteCurrentUser()
      await authClient.signOut()
      void router.navigate({ to: "/login" })
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
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
      title="Delete Account"
      description="This action is permanent and cannot be undone. All your data will be deleted. If you are the sole member of an organization, that organization will also be permanently deleted."
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!isConfirmed || isDeleting} onClick={() => void handleDelete()}>
            {isDeleting ? "Deleting..." : "Delete Account"}
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

function DeleteAccountSection() {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <Text.H4 weight="bold">Delete Account</Text.H4>
      <Text.H5 color="foregroundMuted">
        Permanently delete your account and all associated data. If you are the sole member of an organization, that
        organization will also be deleted.
      </Text.H5>
      <div>
        <DeleteAccountConfirmModal open={confirmOpen} setOpen={setConfirmOpen} />
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Delete Account
        </Button>
      </div>
    </div>
  )
}

// --- User Settings Page ---

function UserSettingsPage() {
  return (
    <Container className="pt-14">
      <ProfileSection />
      <CreateOrganizationSection />
      <DeleteAccountSection />
    </Container>
  )
}
