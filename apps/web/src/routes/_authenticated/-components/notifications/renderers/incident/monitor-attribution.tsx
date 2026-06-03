import { formatHumanReadableAlert } from "@domain/monitors"
import type { IncidentClosedPayload, IncidentEventPayload, IncidentOpenedPayload } from "@domain/notifications"
import { Text } from "@repo/ui"

type IncidentPayload = IncidentEventPayload | IncidentOpenedPayload | IncidentClosedPayload

/**
 * "Created by monitor X" line (+ humanised alert rule) on monitor-owned
 * incidents. Plain text rather than a link: the surrounding card already links
 * to the incident source, and nesting an anchor inside it is invalid. Renders
 * nothing on legacy incidents (no `monitorName`).
 */
export function MonitorAttribution({ payload }: { readonly payload: IncidentPayload }) {
  if (!payload.monitorName) return null
  const summary = payload.condition
    ? formatHumanReadableAlert({ kind: payload.incidentKind, condition: payload.condition })
    : null
  return (
    <div className="flex flex-col gap-0.5 pt-1">
      <Text.H6 color="foregroundMuted">Created by monitor {payload.monitorName}</Text.H6>
      {summary ? <Text.H6 color="foregroundMuted">{summary}</Text.H6> : null}
    </div>
  )
}
