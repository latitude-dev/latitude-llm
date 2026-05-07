import { alertIncidentIdSchema, cuidSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * Discriminator for the entity that produced an alert. Polymorphic source pointer:
 * `(sourceType, sourceId)` together identify the subject of the incident.
 */
export const ALERT_INCIDENT_SOURCE_TYPES = ["issue"] as const
export const alertIncidentSourceTypeSchema = z.enum(ALERT_INCIDENT_SOURCE_TYPES)
export type AlertIncidentSourceType = z.infer<typeof alertIncidentSourceTypeSchema>

/**
 * Namespaced kind. The prefix matches `sourceType` so kinds remain unambiguous
 * even when future source types add their own variants (e.g. `saved_search.threshold`).
 */
export const ALERT_INCIDENT_KINDS = ["issue.new", "issue.regressed", "issue.escalating"] as const
export const alertIncidentKindSchema = z.enum(ALERT_INCIDENT_KINDS)
export type AlertIncidentKind = z.infer<typeof alertIncidentKindSchema>

export const ALERT_SEVERITIES = ["medium", "high"] as const
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES)
export type AlertSeverity = z.infer<typeof alertSeveritySchema>

/**
 * Hardcoded severity per kind for V1. Stored on the row so future configurable
 * severity can land without a migration.
 */
export const SEVERITY_FOR_KIND: Record<AlertIncidentKind, AlertSeverity> = {
  "issue.new": "medium",
  "issue.regressed": "high",
  "issue.escalating": "high",
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
