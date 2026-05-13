import {
  ALERT_INCIDENT_KINDS,
  ALERT_INCIDENT_SOURCE_TYPES,
  ALERT_SEVERITIES,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  type AlertSeverity,
  alertIncidentIdSchema,
  alertIncidentKindSchema,
  alertIncidentSourceTypeSchema,
  alertSeveritySchema,
  cuidSchema,
  organizationIdSchema,
  projectIdSchema,
  SEVERITY_FOR_KIND,
} from "@domain/shared"
import { z } from "zod"

// Re-export the alert-kind / severity primitives that used to live here so
// existing `@domain/alerts` consumers keep working unchanged. The canonical
// declarations now live in `@domain/shared` so non-alert domains (notifications,
// project settings) can key off them without depending on `@domain/alerts`.
export {
  ALERT_INCIDENT_KINDS,
  ALERT_INCIDENT_SOURCE_TYPES,
  ALERT_SEVERITIES,
  alertIncidentKindSchema,
  type AlertIncidentKind,
  alertIncidentSourceTypeSchema,
  type AlertIncidentSourceType,
  type AlertSeverity,
  alertSeveritySchema,
  SEVERITY_FOR_KIND,
}

export const alertIncidentSchema = z.object({
  id: alertIncidentIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sourceType: alertIncidentSourceTypeSchema,
  sourceId: cuidSchema, // V1 sources are issues; widen if future sources need other id shapes
  kind: alertIncidentKindSchema,
  severity: alertSeveritySchema,
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  createdAt: z.date(),
})

export type AlertIncident = z.infer<typeof alertIncidentSchema>
