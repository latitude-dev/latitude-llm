import type { FilterSet, MonitorMetric, MonitorStream } from "@domain/shared"
import { sql } from "drizzle-orm"
import { boolean, index, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const monitors = latitudeSchema.table(
  "monitors",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description").default("").notNull(),
    system: boolean("system").default(false).notNull(),
    // Unified query-time target (the `event.*`/`metric.*` model). All `target_*` + `metric`
    // are null together for legacy source-based alerts and system issue monitors. `target_stream`
    // null ⇒ no target. `target_saved_search_id` set ⇒ predicate resolved live from that search.
    targetStream: varchar("target_stream", { length: 32 }).$type<MonitorStream>(),
    targetFilterSet: jsonb("target_filter_set").$type<FilterSet>(),
    targetQuery: text("target_query"),
    targetSavedSearchId: cuid("target_saved_search_id", { default: false }),
    metric: jsonb("metric").$type<MonitorMetric>(),
    mutedAt: tzTimestamp("muted_at"),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("monitors"),
    // Partial so a soft-deleted monitor's slug can be reused.
    uniqueIndex("monitors_project_slug_uq").on(t.projectId, t.slug).where(sql`deleted_at IS NULL`),
    index("monitors_org_project_active_idx").on(t.organizationId, t.projectId).where(sql`deleted_at IS NULL`),
  ],
)
