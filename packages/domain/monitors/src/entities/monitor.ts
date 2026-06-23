import {
  alertIncidentConditionSchema,
  alertIncidentKindSchema,
  alertIncidentSourceTypeSchema,
  alertSeveritySchema,
  cuidSchema,
  filterSetSchema,
  monitorAlertIdSchema,
  monitorIdSchema,
  monitorMetricSchema,
  monitorStreamSchema,
  organizationIdSchema,
  projectIdSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * What a query-time monitor watches: a stream + predicate + the metric to measure
 * (the unified `event.*`/`metric.*` model). `savedSearchId` set ⇒ the predicate
 * resolves live from that saved search (inline `filterSet`/`query` left null);
 * otherwise the inline `filterSet`/`query` apply. A monitor's `target` is `null`
 * for legacy source-based alerts (target on the alert) and system issue monitors.
 */
export const MONITOR_TARGET_KINDS = ["signal", "tool", "user", "session", "savedSearch"] as const
export const monitorTargetKindSchema = z.enum(MONITOR_TARGET_KINDS)
export type MonitorTargetKind = z.infer<typeof monitorTargetKindSchema>

export const monitorTargetSchema = z.object({
  kind: monitorTargetKindSchema,
  stream: monitorStreamSchema,
  filterSet: filterSetSchema.nullable(),
  query: z.string().nullable(),
  savedSearchId: cuidSchema.nullable(),
  metric: monitorMetricSchema,
})
export type MonitorTarget = z.infer<typeof monitorTargetSchema>

/**
 * Decode a target's product `kind` from its persisted query-plan fields — the
 * inverse of the create-time kind→query-plan encoding that `createMonitor`
 * validates. `savedSearchId`/`stream` uniquely identify the kind, so `kind` is
 * recoverable rather than stored. This is the single source of truth for
 * classifying a persisted target; repositories must not re-derive it independently.
 */
export const monitorTargetKind = (target: Pick<MonitorTarget, "stream" | "savedSearchId">): MonitorTargetKind => {
  if (target.savedSearchId) return "savedSearch"
  if (target.stream === "spans") return "tool"
  if (target.stream === "sessions") return "session"
  return "user"
}

/**
 * A `(kind, source, condition, severity)` firing rule owned by a monitor.
 * `source.id = null` means "all entities of `source.type`". `source` itself is
 * `null` for UNIFIED kinds (`event.*`/`metric.*`) — they watch the monitor's
 * `target`, not a `(sourceType, sourceId)`. `condition` is `null` for kinds with
 * no parameters (`issue.new`, `issue.regressed`, `savedSearch.match`,
 * `event.matched`); otherwise the kind-specific `AlertIncidentCondition`.
 */
export const monitorAlertSchema = z.object({
  id: monitorAlertIdSchema,
  monitorId: monitorIdSchema,
  kind: alertIncidentKindSchema,
  source: z
    .object({
      type: alertIncidentSourceTypeSchema,
      id: cuidSchema.nullable(),
    })
    .nullable(),
  condition: alertIncidentConditionSchema.nullable(),
  severity: alertSeveritySchema,
  createdAt: z.date(),
})
export type MonitorAlert = z.infer<typeof monitorAlertSchema>

/**
 * Owns one or more alerts, scoped to a project. `mutedAt` is the only seam
 * into notifications — a muted monitor short-circuits the producer fan-out;
 * monitors otherwise own no notification config (routing stays in
 * `@domain/notifications`). `deletedAt` soft-deletes (hidden + stops firing).
 *
 * `system` monitors are auto-provisioned, not deletable, and structurally
 * locked: name/slug and the alert set (kind/source/severity) are fixed, but
 * `mutedAt` and the predefined alerts' `condition` values stay editable (e.g.
 * the `issue.escalating` alert's `sensitivity`).
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
  alerts: z.array(monitorAlertSchema).readonly(),
  /** The unified query-time target; `null` for legacy source-based + system issue monitors. */
  target: monitorTargetSchema.nullable(),
  mutedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Monitor = z.infer<typeof monitorSchema>
