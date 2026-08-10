import { billingLimitReachedRenderer } from "./billing-limit-reached.ts"
import { customMessageRenderer } from "./custom-message.ts"
import { destinationQuarantinedRenderer } from "./destination-quarantined.ts"
import { incidentClosedRenderer } from "./incident-closed.ts"
import { incidentEventRenderer } from "./incident-event.ts"
import { incidentOpenedRenderer } from "./incident-opened.ts"
import { signalAssignedRenderer } from "./signal-assigned.ts"
import { signalDiscoveredRenderer } from "./signal-discovered.ts"
import { signalRegressedRenderer } from "./signal-regressed.ts"
import type { SlackNotificationRendererRegistry } from "./types.ts"
import { wrappedReportRenderer } from "./wrapped-report.ts"

/**
 * Exhaustive registry mapping `NotificationKind` → Slack renderer.
 * Adding a new kind to `NOTIFICATION_KIND_META` triggers a TS error
 * here until the matching renderer is added.
 */
export const NOTIFICATION_SLACK_RENDERERS: SlackNotificationRendererRegistry = {
  "incident.event": incidentEventRenderer,
  "incident.opened": incidentOpenedRenderer,
  "incident.closed": incidentClosedRenderer,
  "wrapped.report": wrappedReportRenderer,
  "custom.message": customMessageRenderer,
  "issue.assigned": signalAssignedRenderer,
  "signal.discovered": signalDiscoveredRenderer,
  "signal.regressed": signalRegressedRenderer,
  "destination.quarantined": destinationQuarantinedRenderer,
  "billing.limit-reached": billingLimitReachedRenderer,
}
