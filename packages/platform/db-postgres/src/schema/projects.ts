import { text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Projects table - stores projects within organizations.
 *
 * Supports soft delete via deleted_at.
 * RLS is enabled on this table.
 *
 * Scoped to the 'latitude' schema.
 */

export const projects = latitudeSchema.table(
  "projects",
  {
    id: cuid("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull(),
    deletedAt: tzTimestamp("deleted_at"),
    lastEditedAt: tzTimestamp("last_edited_at").notNull().defaultNow(),
    ...timestamps(),
  },
  () => [organizationRLSPolicy("projects")],
)
