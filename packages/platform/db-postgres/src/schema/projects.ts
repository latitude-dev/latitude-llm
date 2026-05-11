import type { ProjectSettings } from "@domain/shared"
import { index, jsonb, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const projects = latitudeSchema.table(
  "projects",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    // url-safe identifier derived from `name`; regenerated on rename via
    // `updateProjectUseCase`. Length matches `SLUG_MAX_LENGTH` in
    // `@domain/shared/slug` (system-wide cap for user-derived slugs). The
    // M1 migration narrows pre-existing rows: any slug longer than 128
    // chars is truncated to 121 chars + `-{6-char-id}` (still unique per
    // org) before the column is narrowed.
    slug: varchar("slug", { length: 128 }).notNull(),
    settings: jsonb("settings").$type<ProjectSettings>(),
    firstTraceAt: tzTimestamp("first_trace_at"),
    deletedAt: tzTimestamp("deleted_at"),
    lastEditedAt: tzTimestamp("last_edited_at").notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("projects"),
    index("projects_organization_id_idx").on(t.organizationId),
    // Soft-delete-aware uniqueness so soft-deleted rows can re-use a slug.
    // Pre-existing projects may have non-unique slugs; the M1 migration
    // backfills any duplicates with `-{6-char-id}` suffixes before adding
    // this constraint.
    unique("projects_unique_slug_per_organization_idx").on(t.organizationId, t.slug, t.deletedAt).nullsNotDistinct(),
  ],
)
