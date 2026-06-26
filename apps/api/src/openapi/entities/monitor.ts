import { ALERT_SEVERITIES } from "@domain/incidents"
import type { Monitor, MonitorIncidentItem } from "@domain/monitors"
import { cuidSchema, FILTER_OPERATORS, MONITOR_TARGET_TYPES, MONITOR_TRIGGERS } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { AlertConditionSchema, incidentFields, toIncidentResponse } from "./incident.ts"

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

export const MonitorMetricSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("count").describe("Count matching events in each evaluation bucket.") }),
    z.object({ kind: z.literal("errorRate").describe("Measure the fraction of matching events that errored.") }),
    z.object({
      kind: z.literal("sum").describe("Sum a numeric field over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("min").describe("Find the minimum numeric field value over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("max").describe("Find the maximum numeric field value over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("avg").describe("Average a numeric field over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("median").describe("Find the median numeric field value over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("p95").describe("Find the 95th-percentile numeric field value over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
  ])
  .openapi("MonitorMetric")

export const MonitorTargetSchema = z
  .object({
    type: z
      .enum(MONITOR_TARGET_TYPES)
      .describe("Product target category: `savedSearch`, `tool`, `user`, or `session`."),
    id: cuidSchema.nullable().describe("Target entity id, or `null` for project-wide targets."),
    filterSet: FilterSetSchema.optional().describe("Additional filters applied when evaluating the monitor."),
    query: z.string().nullable().optional().describe("Semantic query applied when evaluating inline trace targets."),
  })
  .openapi("MonitorTarget")

const MonitorConfigSchema = z
  .object({
    filterSet: FilterSetSchema.optional().describe("Filters applied by the monitor rule."),
    query: z.string().nullable().optional().describe("Semantic query applied by inline monitor targets."),
    metric: MonitorMetricSchema.optional().describe("Metric evaluated by threshold and escalating monitor rules."),
    condition: AlertConditionSchema.optional().describe("Condition that controls threshold or escalating incidents."),
  })
  .openapi("MonitorConfig")

const MonitorRuleSchema = z
  .object({
    trigger: z
      .enum(MONITOR_TRIGGERS)
      .describe("When the monitor opens incidents: `match`, `threshold`, or `escalating`."),
    config: MonitorConfigSchema.describe("Rule configuration used when the monitor is evaluated."),
    severity: z
      .enum(ALERT_SEVERITIES)
      .describe("Severity of incidents this monitor opens: `low`, `medium`, or `high`."),
  })
  .openapi("MonitorRule")

const monitorFields = {
  id: cuidSchema.describe("Stable monitor identifier."),
  organizationId: cuidSchema.describe("Organization that owns this monitor."),
  projectId: cuidSchema.describe("Project this monitor belongs to."),
  slug: z.string().describe("URL-safe slug derived from `name`. Unique within the project."),
  name: z.string().describe("Human-readable name."),
  description: z.string().describe("Free-form description. Empty string when not set."),
  system: z
    .boolean()
    .describe("`true` for auto-provisioned system monitors, which cannot be deleted or edited; `false` otherwise."),
  target: MonitorTargetSchema.describe("Entity or filter set watched by this monitor."),
  rule: MonitorRuleSchema.describe("Single rule evaluated by this monitor."),
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

export const toMonitorResponse = (monitor: Monitor) => ({
  id: monitor.id as string,
  organizationId: monitor.organizationId as string,
  projectId: monitor.projectId as string,
  slug: monitor.slug,
  name: monitor.name,
  description: monitor.description,
  system: monitor.system,
  target: monitor.target,
  rule: monitor.rule,
  mutedAt: monitor.mutedAt ? monitor.mutedAt.toISOString() : null,
  deletedAt: monitor.deletedAt ? monitor.deletedAt.toISOString() : null,
  createdAt: monitor.createdAt.toISOString(),
  updatedAt: monitor.updatedAt.toISOString(),
})

export const toMonitorIncidentResponse = (item: MonitorIncidentItem) => ({
  ...toIncidentResponse(item.incident),
  notified: item.notified,
})

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
