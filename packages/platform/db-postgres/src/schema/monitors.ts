import { sql } from "drizzle-orm"
import { boolean, index, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
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
