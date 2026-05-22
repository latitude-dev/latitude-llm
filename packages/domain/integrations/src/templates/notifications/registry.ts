import { customMessageRenderer } from "./custom-message.ts"
import { incidentClosedRenderer } from "./incident-closed.ts"
import { incidentEventRenderer } from "./incident-event.ts"
import { incidentOpenedRenderer } from "./incident-opened.ts"
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
}
