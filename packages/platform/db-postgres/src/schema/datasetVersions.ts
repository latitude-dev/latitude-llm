import { bigint, integer, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const datasetVersions = latitudeSchema.table(
  "dataset_versions",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    datasetId: cuid("dataset_id").notNull(),
    version: bigint("version", { mode: "number" }).notNull(),
    rowsInserted: integer("rows_inserted").notNull().default(0),
    rowsUpdated: integer("rows_updated").notNull().default(0),
    rowsDeleted: integer("rows_deleted").notNull().default(0),
    source: varchar("source", { length: 64 }).notNull().default("api"),
    actorId: varchar("actor_id", { length: 24 }),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("dataset_versions"),
    uniqueIndex("dataset_versions_dataset_id_version_idx").on(t.datasetId, t.version),
  ],
)
