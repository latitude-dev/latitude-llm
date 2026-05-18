import { EMAIL_NOTIFICATIONS_FLAG } from "@domain/feature-flags"
import { NOTIFICATION_GROUP_META, NOTIFICATION_GROUPS, type NotificationPreferences } from "@domain/shared"
import {
  Button,
  FormWrapper,
  Icon,
  Input,
  Label,
  Modal,
  Switch,
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
import { relativeTime, toTitle } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  Gamepad2,
  Loader2,
  LogOut,
  type LucideIcon,
  Microchip,
  Monitor,
  RectangleGoggles,
  TabletSmartphone,
  Tv,
  Watch,
} from "lucide-react"
import { useState } from "react"
import { hasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../../../../../domains/notifications/notifications.functions.ts"
import { deleteCurrentUser, updateUserName } from "../../../../../domains/sessions/session.functions.ts"
import {
  listUserSessions,
  revokeAllOtherUserSessions,
  revokeUserSession,
  type UserSessionDto,
} from "../../../../../domains/sessions/user-sessions.functions.ts"
import { authClient } from "../../../../../lib/auth-client.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { useAuthenticatedUser } from "../../../-route-data.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/account")({
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
  const browser = session.browserName ? toTitle(session.browserName) : "Unknown browser"
  const os = session.osName ? ` on ${toTitle(session.osName)}` : " on a"
  const device = ` ${session.deviceKind.toLowerCase()}`
  return `${browser}${os}${device}`
}

/**
 * UA-Parser device-type → lucide icon. Keys mirror the values
 * `UAParser().device.type` can return, plus our `"desktop"` fallback for the
 * undefined case. Anything we don't recognize falls back to the generic
 * `tablet-smartphone` so an unexpected value never breaks the row.
 */
const DEVICE_ICONS: Readonly<Record<string, LucideIcon>> = {
  desktop: Monitor,
  mobile: TabletSmartphone,
  tablet: TabletSmartphone,
  console: Gamepad2,
  smarttv: Tv,
  wearable: Watch,
  xr: RectangleGoggles,
  embedded: Microchip,
}

const deviceIconFor = (kind: string): LucideIcon => DEVICE_ICONS[kind] ?? TabletSmartphone

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

  // Current device pinned to the top so the user sees "this is me" first;
  // every other session sorted by `createdAt` desc (newest connection first).
  const sessions = (data ?? []).slice().sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  })
  const otherCount = sessions.filter((s) => !s.current).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <Text.H5 weight="semibold">Sessions</Text.H5>
          <Text.H5 color="foregroundMuted">
            Devices currently signed in to your account. Sign out of any device you don't recognize
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
                <TableHead>Created at</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id} verticalPadding hoverable={false}>
                  <TableCell>
                    <div className="inline-flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon icon={deviceIconFor(s.deviceKind)} size="sm" color="foregroundMuted" />
                      </div>
                      <Text.H5>
                        {formatDeviceLine(s)}
                        {s.current ? (
                          <Text.H5 color="foregroundMuted" asChild>
                            <span>&nbsp;· This device</span>
                          </Text.H5>
                        ) : null}
                      </Text.H5>
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
                    <Text.H5 color="foregroundMuted">{relativeTime(s.createdAt)}</Text.H5>
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

function NotificationsSection() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Hide the entire section when the org doesn't have the email channel
  // enabled — toggles for an inactive channel would just confuse users.
  // The notifications backend also gates the email send on this flag,
  // so the UI mirrors what the worker actually does.
  const { data: emailNotificationsEnabled = false } = useQuery({
    queryKey: ["feature-flag", EMAIL_NOTIFICATIONS_FLAG],
    queryFn: () => hasFeatureFlag({ data: { identifier: EMAIL_NOTIFICATIONS_FLAG } }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: () => getNotificationPreferences(),
    enabled: emailNotificationsEnabled,
  })

  // Local prefs mirror server prefs; saves run in the background per change.
  // Missing entries are treated as "email on" so a fresh user sees every
  // toggle in the on position (matches the opt-out default).
  const prefs: NotificationPreferences = data?.preferences ?? {}

  const setGroupEmail = async (group: (typeof NOTIFICATION_GROUPS)[number], enabled: boolean) => {
    const next: NotificationPreferences = {
      ...prefs,
      [group]: { ...(prefs[group] ?? {}), email: enabled },
    }
    // Optimistic update so the toggle never lags behind the user's intent.
    queryClient.setQueryData(["notificationPreferences"], { preferences: next })
    try {
      await updateNotificationPreferences({ data: { preferences: next } })
    } catch (error) {
      // Roll back on failure.
      queryClient.setQueryData(["notificationPreferences"], { preferences: prefs })
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  if (!emailNotificationsEnabled) return null

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H5 weight="semibold">Email notifications</Text.H5>
        <Text.H5 color="foregroundMuted">
          Choose which kinds of notifications you'd like to receive by email. In-app notifications always appear in the
          bell.
        </Text.H5>
      </div>
      <div className="flex w-full flex-col gap-1">
        {NOTIFICATION_GROUPS.map((group) => {
          const meta = NOTIFICATION_GROUP_META[group]
          const enabled = prefs[group]?.email ?? true
          const inputId = `notification-pref-${group}`
          return (
            <div
              key={group}
              className="flex w-full flex-row items-center justify-between gap-4 rounded-lg bg-muted/30 p-4"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor={inputId}>{meta.label}</Label>
                <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
              </div>
              <Switch
                id={inputId}
                checked={enabled}
                disabled={isLoading}
                onCheckedChange={(checked) => void setGroupEmail(group, checked)}
                aria-label={`Toggle email notifications for ${meta.label}`}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AccountSettingsPage() {
  const user = useAuthenticatedUser()
  const { toast } = useToast()
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const form = useForm({
    defaultValues: { name: user.name ?? "" },
    onSubmit: createFormSubmitHandler(
      async ({ name }) => {
        await updateUserName({ data: { name: name.trim() } })
      },
      {
        resetOnSuccess: false,
        onSuccess: () => {
          toast({ description: "Name updated" })
          // `useAuthenticatedUser` is sourced from route data; refresh so
          // the new name shows up wherever the user is rendered.
          void router.invalidate()
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <>
      <Text.H4 weight="bold">Account</Text.H4>
      <form
        className="flex w-full flex-col gap-3 @[800px]:w-1/2"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              key={user.id}
              required
              type="text"
              name={field.name}
              label="Name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
              placeholder="Your name"
              aria-label="Your name"
            />
          )}
        </form.Field>
        <div className="self-start">
          <Button type="submit" isLoading={form.state.isSubmitting}>
            Save
          </Button>
        </div>
      </form>
      <NotificationsSection />
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
    </>
  )
}
