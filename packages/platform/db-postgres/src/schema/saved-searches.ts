import type { FilterSet } from "@domain/shared"
import { index, jsonb, text, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const savedSearches = latitudeSchema.table(
  "saved_searches",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    query: text("query"),
    filterSet: jsonb("filter_set").$type<FilterSet>().notNull(),
    assignedUserId: cuid("assigned_user_id"),
    createdByUserId: cuid("created_by_user_id").notNull(),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("saved_searches"),
    index("saved_searches_organization_id_idx").on(t.organizationId),
    index("saved_searches_project_id_idx").on(t.organizationId, t.projectId, t.deletedAt),
    index("saved_searches_assigned_user_id_idx").on(t.organizationId, t.assignedUserId, t.deletedAt),
    unique("saved_searches_unique_slug_per_project_idx")
      .on(t.organizationId, t.projectId, t.slug, t.deletedAt)
      .nullsNotDistinct(),
  ],
)
