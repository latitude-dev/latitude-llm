import { customMessageRenderer } from "./custom-message/index.tsx"
import { incidentClosedRenderer } from "./incident-closed/index.tsx"
import { incidentOpenedRenderer } from "./incident-opened/index.tsx"
import type { NotificationEmailRendererRegistry } from "./types.ts"
import { wrappedReportRenderer } from "./wrapped-report/index.tsx"

/**
 * Exhaustive registry mapping `NotificationKind` → email renderer. Adding a
 * new kind to `NOTIFICATION_KIND_META` triggers a TS error here until the
 * matching renderer is added.
 */
export const NOTIFICATION_EMAIL_RENDERERS: NotificationEmailRendererRegistry = {
  "incident.opened": incidentOpenedRenderer,
  "incident.closed": incidentClosedRenderer,
  "wrapped.report": wrappedReportRenderer,
  "custom.message": customMessageRenderer,
}
