import { bigint, index, text, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const datasets = latitudeSchema.table(
  "datasets",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(), // url-safe identifier derived from name; regenerated on rename. Unique per (organization_id, project_id) among non-soft-deleted rows. Length matches `SLUG_MAX_LENGTH` in `@domain/shared/slug`. Backfilled from `name` in the M1 migration cascade; new rows get a slug from `createDataset` (and `renameDataset` / `updateDatasetDetails` regenerate on rename).
    name: varchar("name", { length: 256 }).notNull(),
    description: text("description"),
    fileKey: text("file_key"),
    currentVersion: bigint("current_version", { mode: "number" }).notNull().default(0),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("datasets"),
    index("datasets_organization_id_idx").on(t.organizationId),
    index("datasets_project_id_idx").on(t.organizationId, t.projectId, t.deletedAt),
    unique("datasets_unique_name_per_project_idx")
      .on(t.organizationId, t.projectId, t.name, t.deletedAt)
      .nullsNotDistinct(),
    // Slug is non-null, so the only NULLable column in the constraint is `deletedAt`.
    // `nullsNotDistinct` makes two non-deleted rows share-a-slug a conflict (deletedAt
    // = NULL on both), while soft-deleted rows can re-use the same slug freely.
    unique("datasets_unique_slug_per_project_idx")
      .on(t.organizationId, t.projectId, t.slug, t.deletedAt)
      .nullsNotDistinct(),
  ],
)
