import type { FilterSet } from "@domain/shared"
import { SLUG_MAX_LENGTH } from "@domain/shared"
import { CUSTOM_BEHAVIOR_NAME_MAX_LENGTH, type CustomBehaviorStatus } from "@domain/taxonomy"
import { index, jsonb, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/** A named, project-scoped exploration scope. Slug is unique per project. */
export const customBehaviors = latitudeSchema.table(
  "custom_behaviors",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    name: varchar("name", { length: CUSTOM_BEHAVIOR_NAME_MAX_LENGTH }).notNull(),
    slug: varchar("slug", { length: SLUG_MAX_LENGTH }).notNull(),
    filterSet: jsonb("filter_set").$type<FilterSet>().notNull(),
    // The facet this behavior gardens through: NULL = topic, non-null = a facet.
    facetId: cuid("facet_id", { default: false }),
    status: varchar("status", { length: 16 }).$type<CustomBehaviorStatus>().notNull().default("pending"),
    // Gardening throttle anchor, stamped at each run start; null = never gardened.
    lastGardenedAt: tzTimestamp("last_gardened_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("custom_behaviors"),
    index("custom_behaviors_project_idx").on(t.organizationId, t.projectId),
    unique("custom_behaviors_unique_slug_per_project_idx").on(t.organizationId, t.projectId, t.slug),
  ],
)
