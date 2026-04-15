import { Button, Container, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import { deleteCurrentUser, updateUserName } from "../../../domains/sessions/session.functions.ts"
import { authClient } from "../../../lib/auth-client.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { useAuthenticatedUser } from "../-route-data.ts"

export const Route = createFileRoute("/_authenticated/settings/account")({
  component: AccountSettingsPage,
})

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

function AccountSettingsPage() {
  const user = useAuthenticatedUser()
  const { toast } = useToast()
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [name, setName] = useState(user.name ?? "")
  const [deleteOpen, setDeleteOpen] = useState(false)

  const saveField = useCallback(
    (newName: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          await updateUserName({ data: { name: newName } })
          toast({ description: "Name updated" })
          void router.invalidate()
        } catch (error) {
          toast({ variant: "destructive", description: toUserMessage(error) })
        }
      }, 600)
    },
    [toast, router],
  )

  return (
    <Container className="flex flex-col gap-8 pt-14">
      <Text.H4 weight="bold">Account</Text.H4>
      <div className="flex max-w-lg flex-col gap-6">
        <Input
          required
          type="text"
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            saveField(e.target.value)
          }}
          placeholder="Your name"
        />
      </div>
      <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <Text.H4 weight="bold" color="destructive">
          Delete Account
        </Text.H4>
        <Text.H5 color="destructive">
          Permanently delete your account and all associated data. If you are the sole member of an organization, that
          organization will also be deleted.
        </Text.H5>
        <div>
          <DeleteAccountConfirmModal open={deleteOpen} setOpen={setDeleteOpen} />
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete Account
          </Button>
        </div>
      </div>
    </Container>
  )
}
