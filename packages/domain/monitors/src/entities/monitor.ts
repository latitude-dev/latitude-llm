import {
  type AlertIncidentCondition,
  alertIncidentConditionSchema,
  alertSeveritySchema,
  cuidSchema,
  type FilterSet,
  filterSetSchema,
  type MonitorConfig,
  type MonitorStream,
  type MonitorTargetType,
  monitorConfigSchema,
  monitorIdSchema,
  monitorMetricSchema,
  monitorStreamSchema,
  monitorTargetTypeSchema,
  monitorTriggerSchema,
  organizationIdSchema,
  projectIdSchema,
} from "@domain/shared"
import { z } from "zod"

export const monitorTargetSchema = z.object({
  type: monitorTargetTypeSchema,
  id: cuidSchema.nullable(),
  filterSet: filterSetSchema.nullable().optional(),
  kind: monitorTargetTypeSchema.default("user"),
  stream: monitorStreamSchema.default("traces"),
  query: z.string().nullable().default(null),
  savedSearchId: cuidSchema.nullable().default(null),
  metric: monitorMetricSchema.default({ kind: "count" }),
})
export type MonitorTarget = z.infer<typeof monitorTargetSchema>

export const monitorStreamForTargetType = (type: MonitorTargetType): MonitorStream =>
  type === "tool" ? "spans" : type === "session" ? "sessions" : "traces"

export const monitorRuleSchema = z.object({
  trigger: monitorTriggerSchema,
  config: monitorConfigSchema,
  severity: alertSeveritySchema,
})
export type MonitorRule = z.infer<typeof monitorRuleSchema>

export const monitorConfigCondition = (config: MonitorConfig): AlertIncidentCondition | null =>
  alertIncidentConditionSchema.nullable().parse(config.condition ?? null)

export const monitorConfigFilterSet = (config: MonitorConfig): FilterSet | null =>
  filterSetSchema.nullable().parse(config.filterSet ?? null)

/**
 * Owns one or more alerts, scoped to a project. `mutedAt` is the only seam
 * into notifications — a muted monitor short-circuits the producer fan-out;
 * monitors otherwise own no notification config (routing stays in
 * `@domain/notifications`). `deletedAt` soft-deletes (hidden + stops firing).
 *
 * `system` monitors are auto-provisioned, not deletable, and structurally
 * locked: name/slug and the alert set (kind/source/severity) are fixed, but
 * `mutedAt` and the predefined alerts' `condition` values stay editable.
 */
export const monitorSchema = z.object({
  id: monitorIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  /** Derived from `name`, unique per project among non-deleted rows. Fixed for system monitors. */
  slug: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  description: z.string(),
  system: z.boolean(),
  target: monitorTargetSchema,
  rule: monitorRuleSchema,
  mutedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Monitor = z.infer<typeof monitorSchema>
