import { billingLimitReachedRenderer } from "./billing-limit-reached/index.tsx"
import { customMessageRenderer } from "./custom-message/index.tsx"
import { destinationQuarantinedRenderer } from "./destination-quarantined/index.tsx"
import { incidentClosedRenderer } from "./incident-closed/index.tsx"
import { incidentEventRenderer } from "./incident-event/index.tsx"
import { incidentOpenedRenderer } from "./incident-opened/index.tsx"
import { signalAssignedRenderer } from "./signal-assigned/index.tsx"
import { signalDiscoveredRenderer } from "./signal-discovered/index.tsx"
import { signalRegressedRenderer } from "./signal-regressed/index.tsx"
import type { NotificationEmailRendererRegistry } from "./types.ts"
import { wrappedReportRenderer } from "./wrapped-report/index.tsx"

/**
 * Exhaustive registry mapping `NotificationKind` → email renderer. Adding a
 * new kind to `NOTIFICATION_KIND_META` triggers a TS error here until the
 * matching renderer is added.
 */
export const NOTIFICATION_EMAIL_RENDERERS: NotificationEmailRendererRegistry = {
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
