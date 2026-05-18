import { ALERT_INCIDENT_KINDS, ALERT_SEVERITIES, type AlertIncident } from "@domain/alerts"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

export const AlertIncidentSchema = z
  .object({
    id: cuidSchema.describe("Stable incident identifier."),
    kind: z.enum(ALERT_INCIDENT_KINDS).describe("Type of incident."),
    severity: z.enum(ALERT_SEVERITIES).describe("Severity tier."),
    startedAt: z.string().describe("ISO-8601 timestamp at which the incident opened."),
    endedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp at which the incident closed, or `null` if it is still open."),
  })
  .openapi("AlertIncident")

export const toAlertIncidentResponse = (incident: AlertIncident) => ({
  id: incident.id as string,
  kind: incident.kind,
  severity: incident.severity,
  startedAt: incident.startedAt.toISOString(),
  endedAt: incident.endedAt ? incident.endedAt.toISOString() : null,
})
