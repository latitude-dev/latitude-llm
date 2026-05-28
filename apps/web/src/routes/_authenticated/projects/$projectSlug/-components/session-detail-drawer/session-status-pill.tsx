import { Status, Tooltip } from "@repo/ui"
import type { SessionStatus } from "../../../../../../domains/sessions/sessions.collection.ts"

/**
 * Green "Live · 3m ago" pill, shown only while the session is live. Idle
 * sessions render nothing — the surrounding row already conveys the last
 * activity timestamp.
 */
export function SessionStatusPill({
  status,
  lastActivity,
}: {
  readonly status: SessionStatus
  readonly lastActivity: string
}) {
  if (status !== "live") return null

  return (
    <Tooltip asChild trigger={<Status variant="success" label={`Live · ${lastActivity}`} />}>
      This session had activity in the last 5 minutes — more may still be coming in.
    </Tooltip>
  )
}
