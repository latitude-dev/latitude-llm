import { ALERT_INCIDENT_KINDS, ALERT_INCIDENT_SOURCE_TYPES, ALERT_SEVERITIES } from "@domain/alerts"
import { MONITOR_TARGET_KINDS, type Monitor, type MonitorAlert, type MonitorIncidentItem } from "@domain/monitors"
import type { AlertIncidentCondition } from "@domain/shared"
import { cuidSchema, FILTER_OPERATORS, MONITOR_STREAMS } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { AlertConditionSchema, incidentFields, toIncidentResponse } from "./incident.ts"

// --- Monitor + alert response schemas ---------------------------------------

const FilterValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()])).describe("String or numeric values for `in` and `notIn` operators."),
  ])
  .openapi("FilterValue")

const FilterConditionSchema = z
  .object({
    op: z.enum(FILTER_OPERATORS).describe("Comparison operator to apply to the field."),
    value: FilterValueSchema.describe("Value to compare with the field."),
  })
  .openapi("FilterCondition")

const FilterSetSchema = z
  .record(z.string(), z.array(FilterConditionSchema))
  .describe(
    'Field-keyed filters. Use `userId: [{ op: "eq", value: "user-123" }]` for one user, and `operation: [{ op: "eq", value: "execute_tool" }]` plus `toolName` for one tool.',
  )
  .openapi("MonitorFilterSet")

const MonitorMetricSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("count").describe("Count matching events in each evaluation bucket.") }),
    z.object({ kind: z.literal("errorRate").describe("Measure the fraction of matching events that errored.") }),
    z.object({
      kind: z.literal("avg").describe("Average a numeric field over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("p95").describe("Compute the 95th percentile of a numeric field over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("sum").describe("Sum a numeric field over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
  ])
  .openapi("MonitorMetric")

export const MonitorTargetSchema = z
  .object({
    kind: z
      .enum(MONITOR_TARGET_KINDS)
      .describe("Product target category: `tool`, `user`, `session`, `savedSearch`, or system `signal`."),
    stream: z
      .enum(MONITOR_STREAMS)
      .describe(
        "Internal telemetry query stream derived from the product target category: `traces`, `spans`, or `sessions`.",
      ),
    filterSet: FilterSetSchema.nullable().describe(
      "Filters that select the target rows. Use `{}` for all users; use `operation = execute_tool` for all tools.",
    ),
    query: z
      .string()
      .nullable()
      .describe("Optional semantic query applied with the filters. Use `null` for user/tool monitors."),
    savedSearchId: cuidSchema
      .nullable()
      .describe("Saved-search target id, or `null` when `filterSet` and `query` define the target inline."),
    metric: MonitorMetricSchema.describe("Default metric measured by this monitor target."),
  })
  .openapi("MonitorTarget")

const MonitorAlertSourceSchema = z
  .object({
    type: z.enum(ALERT_INCIDENT_SOURCE_TYPES).describe("Entity the alert watches: `savedSearch` or `issue`."),
    id: cuidSchema.nullable().describe("Id of the watched entity, or `null` to watch all entities of its `type`."),
  })
  .openapi("MonitorAlertSource")

const monitorAlertFields = {
  id: cuidSchema.describe("Stable alert identifier."),
  monitorId: cuidSchema.describe("Monitor that owns this alert."),
  kind: z
    .enum(ALERT_INCIDENT_KINDS)
    .describe("What the alert fires on. The `savedSearch.*` kinds watch a saved search; `issue.*` are system-only."),
  source: MonitorAlertSourceSchema.nullable().describe(
    "The entity this alert watches, or `null` for unified alerts whose target lives on the monitor.",
  ),
  condition: AlertConditionSchema.nullable().describe(
    "Kind-specific configuration, or `null` for kinds with no parameters.",
  ),
  severity: z.enum(ALERT_SEVERITIES).describe("Severity of incidents this alert opens: `low`, `medium`, or `high`."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
} as const

export const MonitorAlertSchema = z.object(monitorAlertFields).openapi("MonitorAlert")

const monitorFields = {
  id: cuidSchema.describe("Stable monitor identifier."),
  organizationId: cuidSchema.describe("Organization that owns this monitor."),
  projectId: cuidSchema.describe("Project this monitor belongs to."),
  slug: z.string().describe("URL-safe slug derived from `name`. Unique within the project."),
  name: z.string().describe("Human-readable name."),
  description: z.string().describe("Free-form description. Empty string when not set."),
  system: z
    .boolean()
    .describe("`true` for the auto-provisioned system monitors, which can't be deleted or edited; `false` otherwise."),
  alerts: z.array(MonitorAlertSchema).describe("The monitor's alerts. Always at least one."),
  target: MonitorTargetSchema.nullable().describe(
    "Unified query-time target for tool, user, and raw-stream monitors; `null` for legacy saved-search and system monitors.",
  ),
  mutedAt: z.string().nullable().describe("ISO-8601 timestamp at which the monitor was muted, or `null` when active."),
  deletedAt: z.string().nullable().describe("ISO-8601 timestamp at which the monitor was deleted, or `null`."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
} as const

export const MonitorSchema = z.object(monitorFields).openapi("Monitor")

export const MonitorIncidentSchema = z
  .object({
    ...incidentFields,
    notified: z.boolean().describe("`true` when this incident triggered at least one notification."),
  })
  .openapi("MonitorIncident")

// --- Response mappers -------------------------------------------------------

export const toMonitorAlertResponse = (alert: MonitorAlert) => ({
  id: alert.id as string,
  monitorId: alert.monitorId as string,
  kind: alert.kind,
  source: alert.source ? { type: alert.source.type, id: alert.source.id } : null,
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
  target: monitor.target,
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
      .enum([
        "savedSearch.match",
        "savedSearch.threshold",
        "savedSearch.escalating",
        "event.matched",
        "metric.threshold",
        "metric.escalating",
      ])
      .describe(
        "What the alert fires on. `savedSearch.*` kinds require a saved-search `source`; `event.*` and `metric.*` kinds require `source: null` and a monitor `target`.",
      ),
    source: MonitorAlertSourceSchema.nullable().describe(
      "Saved-search source for `savedSearch.*` alerts, or `null` for tool/user alerts whose target lives on the monitor.",
    ),
    condition: AlertConditionSchema.nullish().describe(
      "Kind-specific configuration. Required for threshold and escalating kinds; omit for match kinds.",
    ),
    severity: z
      .enum(ALERT_SEVERITIES)
      .optional()
      .describe("Severity of incidents this alert opens. Defaults per kind when omitted."),
  })
  .openapi("CreateMonitorAlertBody")

export const UpdateMonitorAlertBodySchema = z
  .object({
    kind: z
      .enum([
        "savedSearch.match",
        "savedSearch.threshold",
        "savedSearch.escalating",
        "event.matched",
        "metric.threshold",
        "metric.escalating",
      ])
      .optional()
      .describe(
        "New alert kind. Not allowed on system monitors. Supply the matching `source` and `condition` when you change it.",
      ),
    source: MonitorAlertSourceSchema.nullable()
      .optional()
      .describe(
        "Replace the saved-search source, or set `null` for unified tool/user alerts. Not allowed on system monitors.",
      ),
    condition: AlertConditionSchema.nullish().describe(
      "Replace the alert's configuration. On system monitors this is the only editable field (e.g. signal-escalation `sensitivity`).",
    ),
    severity: z.enum(ALERT_SEVERITIES).optional().describe("Replace the severity. Not allowed on system monitors."),
  })
  .openapi("UpdateMonitorAlertBody")

/** Re-exported so the route module casts the validated condition back to the domain type. */
export type { AlertIncidentCondition }
