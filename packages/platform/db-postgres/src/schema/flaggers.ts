import type { FlaggerSlug } from "@domain/flaggers"
import { boolean, index, integer, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const flaggers = latitudeSchema.table(
  "flaggers",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 64 }).$type<FlaggerSlug>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sampling: integer("sampling").notNull().default(10),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("flaggers"),
    index("flaggers_project_list_idx").on(t.organizationId, t.projectId),
    unique("flaggers_unique_slug_per_project_idx").on(t.organizationId, t.projectId, t.slug).nullsNotDistinct(),
  ],
)
