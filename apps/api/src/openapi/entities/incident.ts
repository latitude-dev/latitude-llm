import { ALERT_INCIDENT_KINDS, ALERT_INCIDENT_SOURCE_TYPES, ALERT_SEVERITIES, type AlertIncident } from "@domain/alerts"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

export const INCIDENT_KINDS = ALERT_INCIDENT_KINDS
export const INCIDENT_SOURCE_TYPES = ALERT_INCIDENT_SOURCE_TYPES
export const INCIDENT_SEVERITIES = ALERT_SEVERITIES

export const IncidentSchema = z
  .object({
    id: cuidSchema.describe("Stable incident identifier."),
    organizationId: cuidSchema.describe("Organization that owns this incident."),
    projectId: cuidSchema.describe("Project this incident belongs to."),
    sourceType: z
      .enum(INCIDENT_SOURCE_TYPES)
      .describe(
        "Kind of entity that triggered the incident. `issue` for issue-lifecycle incidents; `savedSearch` for incidents raised by a monitor watching a search.",
      ),
    sourceId: cuidSchema.describe("Id of the entity that triggered the incident (matches `sourceType`)."),
    kind: z
      .enum(INCIDENT_KINDS)
      .describe(
        "Reason the incident opened. `issue.new` fires when a new issue is discovered; `issue.regressed` when a resolved issue is detected again; `issue.escalating` when an ongoing issue is being detected more than expected. The `savedSearch.*` kinds are raised by monitors watching a search: `savedSearch.match` on each new matching trace, `savedSearch.threshold` when matching traces are detected above a configured threshold, and `savedSearch.escalating` when they stay above the threshold for a sustained window.",
      ),
    severity: z
      .enum(INCIDENT_SEVERITIES)
      .describe("Severity bucket assigned to the incident: `low`, `medium`, or `high`."),
    startedAt: z.string().describe("ISO-8601 timestamp at which the incident opened."),
    endedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp at which the incident closed, or `null` if still open."),
    createdAt: z.string().describe("ISO-8601 timestamp at which the incident row was created."),
  })
  .openapi("Incident")

export const toIncidentResponse = (incident: AlertIncident) => ({
  id: incident.id as string,
  organizationId: incident.organizationId as string,
  projectId: incident.projectId as string,
  sourceType: incident.sourceType,
  sourceId: incident.sourceId,
  kind: incident.kind,
  severity: incident.severity,
  startedAt: incident.startedAt.toISOString(),
  endedAt: incident.endedAt ? incident.endedAt.toISOString() : null,
  createdAt: incident.createdAt.toISOString(),
})
