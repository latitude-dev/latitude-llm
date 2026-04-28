import { Alert, Badge, Button, CloseTrigger, Icon, Modal, Text, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useRouter } from "@tanstack/react-router"
import { ExternalLinkIcon, GlobeIcon, MonitorIcon, ShieldAlertIcon, SmartphoneIcon, TabletIcon } from "lucide-react"
import { useState } from "react"
import { type AdminUserSessionDto, adminRevokeUserSession } from "../../../domains/admin/users.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { DashboardSection } from "./dashboard/index.ts"

const MAX_VISIBLE_SESSIONS = 12

interface SessionsPanelProps {
  readonly userId: string
  readonly userEmail: string
  readonly sessions: ReadonlyArray<AdminUserSessionDto>
}

/**
 * Sessions panel for the user-detail dashboard.
 *
 * Sibling to Memberships. One row per active session: device + os
 * lockup, browser, location, IP (click-out to ipinfo.io for the
 * full record), started / last-seen / expires relative times,
 * impersonator chip when present, and a per-row Revoke button.
 *
 * Sessions arrive pre-sorted from the repository (impersonation
 * first, then by `updatedAt` desc), so the panel's job is purely
 * presentational.
 *
 * Capped at `MAX_VISIBLE_SESSIONS` rows to keep the render
 * predictable; an overflow tile says "+N more" when the user has
 * an unusually large number of active sessions. Staff hunting for
 * a specific session beyond the cap should revoke all and start
 * fresh.
 */
export function SessionsPanel({ userId, userEmail, sessions }: SessionsPanelProps) {
  const { toast } = useToast()
  const router = useRouter()
  const visible = sessions.slice(0, MAX_VISIBLE_SESSIONS)
  const overflow = sessions.length - visible.length

  // Single shared modal driven by which row was clicked. Avoids one
  // `<Modal>` instance per session row (8+ portals on a typical
  // dashboard) and keeps the confirmation dialog itself consistent
  // with the rest of the backoffice — no native `window.confirm`.
  const [pending, setPending] = useState<AdminUserSessionDto | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeModal = () => {
    setPending(null)
    setIsSubmitting(false)
  }

  const handleConfirm = async () => {
    if (!pending) return
    setIsSubmitting(true)
    try {
      await adminRevokeUserSession({
        data: { userId, sessionId: pending.id },
      })
      toast({ description: "Session revoked." })
      void router.invalidate()
      closeModal()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not revoke session",
        description: toUserMessage(error),
      })
      setIsSubmitting(false)
    }
  }

  return (
    <DashboardSection title="Sessions" count={sessions.length}>
      {sessions.length === 0 ? (
        <Text.H6 color="foregroundMuted">This user has no active sessions.</Text.H6>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isRevoking={isSubmitting && pending?.id === session.id}
              onRevokeClick={() => setPending(session)}
            />
          ))}
          {overflow > 0 && (
            <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-3">
              <Text.H6 color="foregroundMuted">
                +<span className="tabular-nums">{overflow}</span> more session
                {overflow === 1 ? "" : "s"} not shown
              </Text.H6>
            </div>
          )}
        </div>
      )}

      <Modal
        dismissible
        open={pending !== null}
        size="large"
        onOpenChange={(next) => {
          if (!next) closeModal()
        }}
        title="Revoke session"
        description={
          pending ? (
            <Text.H5 color="foregroundMuted">
              Sign <span className="font-medium text-foreground">{userEmail}</span> out of this single session.
            </Text.H5>
          ) : null
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <CloseTrigger />
            <Button variant="default" size="sm" disabled={isSubmitting} onClick={() => void handleConfirm()}>
              {isSubmitting ? "Revoking…" : "Revoke session"}
            </Button>
          </div>
        }
      >
        {pending && (
          <div className="flex flex-col gap-3">
            <Alert
              variant="warning"
              description="The user will be signed out of this browser/device on its next request. Their other sessions are not affected."
            />
            <RevokeModalSummary session={pending} />
          </div>
        )}
      </Modal>
    </DashboardSection>
  )
}

/**
 * Compact summary of the session being revoked, rendered inside the
 * confirmation modal so the actor can sanity-check they're about to
 * drop the right row before clicking through.
 */
function RevokeModalSummary({ session }: { readonly session: AdminUserSessionDto }) {
  const DeviceIcon = deviceIconFor(session.deviceKind)
  const browserLabel =
    session.browserName && session.osName
      ? `${session.browserName} on ${session.osName}`
      : session.browserName || session.osName || "Unknown browser"

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon icon={DeviceIcon} size="sm" color="foregroundMuted" />
      </div>
      <div className="flex min-w-0 flex-col">
        <Text.H5 weight="medium" ellipsis noWrap>
          {browserLabel}
        </Text.H5>
        <Text.H6 color="foregroundMuted" ellipsis noWrap>
          {formatLocation(session.geo)}
          {session.ipAddress ? ` · ${session.ipAddress}` : ""}
        </Text.H6>
      </div>
    </div>
  )
}

const DEVICE_ICON: Record<string, typeof MonitorIcon> = {
  desktop: MonitorIcon,
  mobile: SmartphoneIcon,
  tablet: TabletIcon,
}

function deviceIconFor(deviceKind: string): typeof MonitorIcon {
  return DEVICE_ICON[deviceKind] ?? MonitorIcon
}

function formatLocation(geo: AdminUserSessionDto["geo"]): string {
  if (!geo) return "Unknown location"
  const parts = [geo.city, geo.region, geo.country].filter((p): p is string => typeof p === "string" && p.length > 0)
  return parts.length === 0 ? "Unknown location" : parts.join(", ")
}

function SessionRow({
  session,
  isRevoking,
  onRevokeClick,
}: {
  readonly session: AdminUserSessionDto
  readonly isRevoking: boolean
  readonly onRevokeClick: () => void
}) {
  const DeviceIcon = deviceIconFor(session.deviceKind)
  const browserLabel =
    session.browserName && session.osName
      ? `${session.browserName} on ${session.osName}`
      : session.browserName || session.osName || "Unknown browser"
  const isImpersonation = session.impersonatedByUserId !== null

  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-md border bg-background px-4 py-3",
        isImpersonation ? "border-warning-muted-foreground/40 bg-warning-muted/20" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon icon={DeviceIcon} size="sm" color="foregroundMuted" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <Text.H5 weight="medium" ellipsis noWrap>
                {browserLabel}
              </Text.H5>
              {isImpersonation && (
                <Badge variant="outlineWarningMuted" iconProps={{ icon: ShieldAlertIcon, placement: "start" }}>
                  impersonated
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Icon icon={GlobeIcon} size="xs" color="foregroundMuted" />
              <Text.H6 color="foregroundMuted" ellipsis noWrap>
                {formatLocation(session.geo)}
              </Text.H6>
              {session.ipAddress && (
                <>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <a
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    href={`https://ipinfo.io/${encodeURIComponent(session.ipAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Text.H6 color="foregroundMuted" noWrap>
                      {session.ipAddress}
                    </Text.H6>
                    <Icon icon={ExternalLinkIcon} size="xs" color="foregroundMuted" />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={isRevoking} onClick={onRevokeClick}>
          {isRevoking ? "Revoking…" : "Revoke"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12">
        <Text.H6 color="foregroundMuted">
          last active <span className="text-foreground">{relativeTime(session.updatedAt)}</span>
        </Text.H6>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <Text.H6 color="foregroundMuted">
          started <span className="text-foreground">{relativeTime(session.createdAt)}</span>
        </Text.H6>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <Text.H6 color="foregroundMuted">
          expires <span className="text-foreground">{relativeTime(session.expiresAt)}</span>
        </Text.H6>
        {isImpersonation && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <Text.H6 color="foregroundMuted">
              by <span className="text-foreground">{session.impersonatedByEmail ?? session.impersonatedByUserId}</span>
            </Text.H6>
          </>
        )}
      </div>
    </div>
  )
}
