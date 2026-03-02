import { index, text, varchar, unique, jsonb } from "drizzle-orm/pg-core"
import type { DatasetColumn } from "@domain/datasets"
import { cuid, LATITUDE_SCHEMA, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Datasets table - stores datasets within projects.
 *
 * Supports soft delete via deleted_at.
 * RLS is enabled on this table.
 * Uses text ID for consistency with Better Auth tables.
 *
 * Scoped to the 'latitude' schema.
 */

export const datasets = LATITUDE_SCHEMA.table(
  "projects",
  {
    id: cuid("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull(),
    columns: jsonb('columns').$type<DatasetColumn[]>().notNull(),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (table) => [
    organizationRLSPolicy(),
    index("datasets_table_organization_idx").on(table.organizationId),
    unique("unique_dataset_by_name_project").on(table.projectId, table.name, table.deletedAt).nullsNotDistinct(),
  ],
)
