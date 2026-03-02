import { index, text, jsonb } from "drizzle-orm/pg-core"
import type { DatasetRowData } from "@domain/datasets"
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

export const datasetRows = LATITUDE_SCHEMA.table(
  "dataset_rows",
  {
    id: cuid("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    datasetId: cuid("dataset_id").notNull(),
    rowData: jsonb("row_data").$type<DatasetRowData>().notNull(),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (table) => [organizationRLSPolicy(), index("dataset_rows_table_dataset_idx").on(table.datasetId)],
)
