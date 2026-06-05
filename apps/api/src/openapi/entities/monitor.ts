import { ALERT_INCIDENT_KINDS, ALERT_INCIDENT_SOURCE_TYPES, ALERT_SEVERITIES } from "@domain/alerts"
import type { Monitor, MonitorAlert, MonitorIncidentItem } from "@domain/monitors"
import type { AlertIncidentCondition } from "@domain/shared"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { AlertConditionSchema, incidentFields, toIncidentResponse } from "./incident.ts"

// --- Monitor + alert response schemas ---------------------------------------

const MonitorAlertSourceSchema = z
  .object({
    type: z
      .enum(ALERT_INCIDENT_SOURCE_TYPES)
      .describe("Entity the alert watches: `savedSearch` for search alerts, `issue` for the system issue monitors."),
    id: cuidSchema
      .nullable()
      .describe(
        "Id of the watched entity — a saved search for `savedSearch` alerts. `null` means all entities of `type`, used by the system issue monitors.",
      ),
  })
  .openapi("MonitorAlertSource")

const monitorAlertFields = {
  id: cuidSchema.describe("Stable alert identifier."),
  monitorId: cuidSchema.describe("Monitor that owns this alert."),
  kind: z
    .enum(ALERT_INCIDENT_KINDS)
    .describe(
      "What the alert fires on. `savedSearch.match` opens an incident on each new matching trace; `savedSearch.threshold` when matches cross a count threshold; `savedSearch.escalating` when matches stay above the threshold for a sustained window. `issue.new` / `issue.regressed` / `issue.escalating` belong to the auto-provisioned system monitors.",
    ),
  source: MonitorAlertSourceSchema.describe("The entity this alert watches."),
  condition: AlertConditionSchema.nullable().describe(
    "Kind-specific configuration. `null` for kinds with no parameters (`issue.new`, `issue.regressed`, `savedSearch.match`).",
  ),
  severity: z
    .enum(ALERT_SEVERITIES)
    .describe("Severity assigned to incidents this alert opens: `low`, `medium`, or `high`."),
  createdAt: z.string().describe("ISO-8601 timestamp at which the alert was created."),
} as const

export const MonitorAlertSchema = z.object(monitorAlertFields).openapi("MonitorAlert")

const monitorFields = {
  id: cuidSchema.describe("Stable monitor identifier."),
  organizationId: cuidSchema.describe("Organization that owns this monitor."),
  projectId: cuidSchema.describe("Project this monitor belongs to."),
  slug: z.string().describe("URL-safe slug derived from `name`, unique within the project among active monitors."),
  name: z.string().describe("Human-readable name."),
  description: z.string().describe("Free-form description. Empty string when unset."),
  system: z
    .boolean()
    .describe(
      "`true` for the three auto-provisioned system monitors (issue discovered / regressed / escalating), which cannot be deleted or restructured — only muted, and their alerts' condition values tuned. `false` for monitors you create.",
    ),
  alerts: z.array(MonitorAlertSchema).describe("The monitor's active firing rules. Always at least one."),
  mutedAt: z
    .string()
    .nullable()
    .describe(
      "ISO-8601 timestamp at which the monitor was muted, or `null` when active. A muted monitor still records incidents but sends no notifications.",
    ),
  deletedAt: z
    .string()
    .nullable()
    .describe("ISO-8601 timestamp at which the monitor was deleted, or `null` while active."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
} as const

export const MonitorSchema = z.object(monitorFields).openapi("Monitor")

export const MonitorIncidentSchema = z
  .object({
    ...incidentFields,
    notified: z
      .boolean()
      .describe(
        "`true` when this incident triggered at least one notification; `false` when the monitor was muted or notifications were disabled.",
      ),
  })
  .openapi("MonitorIncident")

// --- Response mappers -------------------------------------------------------

export const toMonitorAlertResponse = (alert: MonitorAlert) => ({
  id: alert.id as string,
  monitorId: alert.monitorId as string,
  kind: alert.kind,
  source: { type: alert.source.type, id: alert.source.id },
  condition: alert.condition,
  severity: alert.severity,
  createdAt: alert.createdAt.toISOString(),
})

export const toMonitorResponse = (monitor: Monitor) => ({
  id: monitor.id as string,
  organizationId: monitor.organizationId as string,
  projectId: monitor.projectId as string,
  slug: monitor.slug,
  name: monitor.name,
  description: monitor.description,
  system: monitor.system,
  alerts: monitor.alerts.map(toMonitorAlertResponse),
  mutedAt: monitor.mutedAt ? monitor.mutedAt.toISOString() : null,
  deletedAt: monitor.deletedAt ? monitor.deletedAt.toISOString() : null,
  createdAt: monitor.createdAt.toISOString(),
  updatedAt: monitor.updatedAt.toISOString(),
})

export const toMonitorIncidentResponse = (item: MonitorIncidentItem) => ({
  ...toIncidentResponse(item.incident),
  notified: item.notified,
})

// --- Opaque cursors ---------------------------------------------------------

/** Opaque page cursor for `listMonitors` — base64url JSON of `{ offset }`. */
export const encodeMonitorCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url")

export const decodeMonitorCursor = (raw: string): { offset: number } | null => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown
    const offset = (parsed as { offset?: unknown }).offset
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) return null
    return { offset }
  } catch {
    return null
  }
}

/** Opaque keyset cursor for `listMonitorIncidents` — base64url JSON of `{ endedAt, id }`. */
export const encodeMonitorIncidentCursor = (cursor: { endedAt: Date | null; id: string }): string =>
  Buffer.from(
    JSON.stringify({ endedAt: cursor.endedAt ? cursor.endedAt.toISOString() : null, id: cursor.id }),
    "utf8",
  ).toString("base64url")

export const decodeMonitorIncidentCursor = (raw: string): { endedAt: Date | null; id: string } | null => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown
    if (parsed === null || typeof parsed !== "object") return null
    const { endedAt, id } = parsed as { endedAt?: unknown; id?: unknown }
    if (typeof id !== "string") return null
    if (endedAt !== null && typeof endedAt !== "string") return null
    return { endedAt: endedAt ? new Date(endedAt) : null, id }
  } catch {
    return null
  }
}

/** Shared between the create-monitor body's alert list and the standalone create-alert body. */
export const CreateMonitorAlertBodySchema = z
  .object({
    kind: z
      .enum(["savedSearch.match", "savedSearch.threshold", "savedSearch.escalating"])
      .describe(
        "What the alert fires on. `savedSearch.match` opens an incident on each new matching trace; `savedSearch.threshold` when matches cross a count threshold; `savedSearch.escalating` when matches stay above the threshold for a sustained window.",
      ),
    source: z
      .object({
        type: z
          .enum(ALERT_INCIDENT_SOURCE_TYPES)
          .describe("Must be `savedSearch` — every user-creatable alert watches a saved search."),
        id: cuidSchema.describe("Id of the saved search this alert watches."),
      })
      .describe("The saved search this alert watches."),
    condition: AlertConditionSchema.nullish().describe(
      "Kind-specific configuration. Required for `savedSearch.threshold` / `savedSearch.escalating`; omit (or `null`) for `savedSearch.match`. The condition's `kind` must equal the alert's `kind`.",
    ),
    severity: z
      .enum(ALERT_SEVERITIES)
      .optional()
      .describe("Severity for incidents this alert opens. Defaults to the kind's canonical severity when omitted."),
  })
  .openapi("CreateMonitorAlertBody")

export const UpdateMonitorAlertBodySchema = z
  .object({
    kind: z
      .enum(["savedSearch.match", "savedSearch.threshold", "savedSearch.escalating"])
      .optional()
      .describe(
        "New alert kind. Allowed only on monitors you own (system monitors keep their kind). When changed, supply the matching `condition`.",
      ),
    source: z
      .object({
        type: z.enum(ALERT_INCIDENT_SOURCE_TYPES).describe("Must be `savedSearch`."),
        id: cuidSchema.describe("Id of the saved search this alert watches."),
      })
      .optional()
      .describe("Replace the watched saved search. Not allowed on system monitors."),
    condition: AlertConditionSchema.nullish().describe(
      "Replace the kind-specific configuration. On system monitors this is the only mutable field (e.g. issue-escalation `sensitivity`). The condition's `kind` must match the alert's kind.",
    ),
    severity: z.enum(ALERT_SEVERITIES).optional().describe("Replace the severity. Not allowed on system monitors."),
  })
  .openapi("UpdateMonitorAlertBody")

/** Re-exported so the route module casts the validated condition back to the domain type. */
export type { AlertIncidentCondition }
