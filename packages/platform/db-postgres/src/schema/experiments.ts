import type { ExperimentVariant } from "@domain/experiments"
import { sql } from "drizzle-orm"
import { index, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const experiments = latitudeSchema.table(
  "experiments",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description").default("").notNull(),
    variants: jsonb("variants").$type<readonly ExperimentVariant[]>().default([]).notNull(),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("experiments"),
    uniqueIndex("experiments_project_slug_uq").on(t.projectId, t.slug).where(sql`deleted_at IS NULL`),
    index("experiments_org_project_active_idx").on(t.organizationId, t.projectId).where(sql`deleted_at IS NULL`),
  ],
)
