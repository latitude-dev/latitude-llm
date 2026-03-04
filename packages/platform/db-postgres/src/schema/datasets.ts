import { bigint, index, text, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const datasets = latitudeSchema.table(
  "datasets",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    description: text("description"),
    fileKey: text("file_key"),
    currentVersion: bigint("current_version", { mode: "number" }).notNull().default(0),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("datasets"),
    index("datasets_project_id_idx").on(t.organizationId, t.projectId, t.deletedAt),
    unique("datasets_unique_name_per_project_idx")
      .on(t.organizationId, t.projectId, t.name, t.deletedAt)
      .nullsNotDistinct(),
  ],
)
