import {
  Button,
  Container,
  FormWrapper,
  Icon,
  Input,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Loader2, LogOut } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { deleteCurrentUser, updateUserName } from "../../../domains/sessions/session.functions.ts"
import {
  listUserSessions,
  revokeAllOtherUserSessions,
  revokeUserSession,
  type UserSessionDto,
} from "../../../domains/sessions/user-sessions.functions.ts"
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

const formatSessionLocation = (session: UserSessionDto): string => {
  if (!session.geo) return "Unknown location"
  const parts = [session.geo.city, session.geo.region, session.geo.country].filter((p): p is string => Boolean(p))
  if (parts.length === 0) return "Unknown location"
  return parts.join(", ")
}

const formatDeviceLine = (session: UserSessionDto): string => {
  const browser = session.browserName ?? "Unknown browser"
  const os = session.osName ? ` on ${session.osName}` : ""
  return `${browser}${os}`
}

function RevokeSessionConfirmModal({ session, onClose }: { session: UserSessionDto; onClose: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [revoking, setRevoking] = useState(false)

  const handleConfirm = async () => {
    setRevoking(true)
    try {
      await revokeUserSession({ data: { token: session.token } })
      toast({ description: "Session signed out" })
      await queryClient.invalidateQueries({ queryKey: ["userSessions"] })
      onClose()
    } catch (error) {
      setRevoking(false)
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !revoking) onClose()
      }}
      title="Sign device out"
      description={`Are you sure you want to sign out "${formatDeviceLine(session)}" of your account? This device will immediately lose access and will need to sign in again.`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={revoking}>
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={revoking}>
            {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            <Text.H5 color="white">{revoking ? "Signing out..." : "Sign out"}</Text.H5>
          </Button>
        </div>
      }
    />
  )
}

function RevokeAllOtherSessionsConfirmModal({ otherCount, onClose }: { otherCount: number; onClose: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [revoking, setRevoking] = useState(false)

  const handleConfirm = async () => {
    setRevoking(true)
    try {
      await revokeAllOtherUserSessions()
      toast({ description: "Signed out everywhere else" })
      await queryClient.invalidateQueries({ queryKey: ["userSessions"] })
      onClose()
    } catch (error) {
      setRevoking(false)
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  const deviceLabel = otherCount === 1 ? "1 other device" : `${otherCount} other devices`

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !revoking) onClose()
      }}
      title="Sign out everywhere else"
      description={`Are you sure you want to sign out of ${deviceLabel}? They will immediately lose access and will need to sign in again. This device will stay signed in.`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={revoking}>
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={revoking}>
            {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            <Text.H5 color="white">{revoking ? "Signing out..." : "Sign out everywhere else"}</Text.H5>
          </Button>
        </div>
      }
    />
  )
}

function SessionsSection() {
  const { data, isLoading } = useQuery({ queryKey: ["userSessions"], queryFn: () => listUserSessions() })
  const [sessionToRevoke, setSessionToRevoke] = useState<UserSessionDto | null>(null)
  const [revokeAllOpen, setRevokeAllOpen] = useState(false)

  const sessions = data ?? []
  const otherCount = sessions.filter((s) => !s.current).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <Text.H5 weight="semibold">Sessions</Text.H5>
          <Text.H5 color="foregroundMuted">
            Devices currently signed in to your account. Revoke any device you don't recognize
          </Text.H5>
        </div>
        {otherCount > 0 ? (
          <Button variant="outline" onClick={() => setRevokeAllOpen(true)}>
            <Icon size="sm" icon={LogOut} />
            Sign out everywhere else
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {isLoading ? (
          <TableSkeleton cols={4} rows={2} />
        ) : sessions.length === 0 ? (
          <Text.H5 color="foregroundMuted">No active sessions.</Text.H5>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id} verticalPadding hoverable={false}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Text.H5>
                        {formatDeviceLine(s)}
                        {s.current ? (
                          <Text.H5 color="foregroundMuted" asChild>
                            <span>&nbsp;· This device</span>
                          </Text.H5>
                        ) : null}
                      </Text.H5>
                      <Text.H6 color="foregroundMuted">on a {s.deviceKind}</Text.H6>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Text.H5 color="foregroundMuted">
                      <div className="flex flex-col">
                        <Text.H5>{formatSessionLocation(s)}</Text.H5>
                        <Text.H6 color="foregroundMuted">{s.ipAddress ?? "Unknown IP address"}</Text.H6>
                      </div>
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 color="foregroundMuted">{new Date(s.updatedAt).toLocaleString()}</Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 color="foregroundMuted">{new Date(s.expiresAt).toLocaleString()}</Text.H5>
                  </TableCell>
                  <TableCell align="right">
                    {s.current ? null : (
                      <Tooltip
                        asChild
                        trigger={
                          <Button variant="ghost" onClick={() => setSessionToRevoke(s)}>
                            <Icon icon={LogOut} size="sm" />
                          </Button>
                        }
                      >
                        Sign this device out
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {sessionToRevoke ? (
        <RevokeSessionConfirmModal session={sessionToRevoke} onClose={() => setSessionToRevoke(null)} />
      ) : null}
      {revokeAllOpen ? (
        <RevokeAllOtherSessionsConfirmModal otherCount={otherCount} onClose={() => setRevokeAllOpen(false)} />
      ) : null}
    </section>
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
      <SessionsSection />
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
