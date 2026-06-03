import { formatHumanReadableAlert } from "@domain/monitors"
import type { IncidentClosedPayload, IncidentEventPayload, IncidentOpenedPayload } from "@domain/notifications"
import { Text } from "@repo/ui"

type IncidentPayload = IncidentEventPayload | IncidentOpenedPayload | IncidentClosedPayload

/**
 * "Created by monitor X" line (+ humanised rule). Plain text, not a link — the card
 * already links to the source and nesting anchors is invalid. Nothing on legacy incidents.
 */
export function MonitorAttribution({ payload }: { readonly payload: IncidentPayload }) {
  if (!payload.monitorName) return null
  const summary = payload.condition
    ? formatHumanReadableAlert({ kind: payload.incidentKind, condition: payload.condition })
    : null
  return (
    <div className="flex flex-col gap-0.5 pt-1">
      <Text.H6 color="foregroundMuted">
        Created by monitor <b>{payload.monitorName}</b>
      </Text.H6>
      {summary ? <Text.H6 color="foregroundMuted">{summary}</Text.H6> : null}
    </div>
  )
}
