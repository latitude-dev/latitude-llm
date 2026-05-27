import { Status } from "@repo/ui"
import type { SessionStatus } from "../../../../../../domains/sessions/sessions.collection.ts"

/** Green "Live · 3m ago" / muted "Idle · 42m ago" pill from the session status. */
export function SessionStatusPill({
  status,
  lastActivity,
}: {
  readonly status: SessionStatus
  readonly lastActivity: string
}) {
  return (
    <Status
      variant={status === "live" ? "success" : "neutral"}
      label={`${status === "live" ? "Live" : "Idle"} · ${lastActivity}`}
    />
  )
}
