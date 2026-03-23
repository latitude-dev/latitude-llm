import { jsonb, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const projects = latitudeSchema.table(
  "projects",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull(),
    settings: jsonb("settings").$type<{ keepMonitoring?: boolean | undefined }>(),
    deletedAt: tzTimestamp("deleted_at"),
    lastEditedAt: tzTimestamp("last_edited_at").notNull().defaultNow(),
    ...timestamps(),
  },
  () => [organizationRLSPolicy("projects")],
)
