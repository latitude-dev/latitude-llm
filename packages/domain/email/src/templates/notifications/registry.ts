import { customMessageTemplate } from "./custom-message/index.tsx"
import { incidentClosedTemplate } from "./incident-closed/index.tsx"
import { incidentOpenedTemplate } from "./incident-opened/index.tsx"
import type { NotificationEmailRendererRegistry } from "./types.ts"
import { wrappedReportTemplate } from "./wrapped-report/index.tsx"

/**
 * Exhaustive registry mapping `NotificationKind` → email renderer. Adding a
 * new kind to `NOTIFICATION_KIND_META` triggers a TS error here until the
 * matching renderer is added.
 */
export const NOTIFICATION_EMAIL_RENDERERS: NotificationEmailRendererRegistry = {
  "incident.opened": incidentOpenedTemplate,
  "incident.closed": incidentClosedTemplate,
  "wrapped.report": wrappedReportTemplate,
  "custom.message": customMessageTemplate,
}
