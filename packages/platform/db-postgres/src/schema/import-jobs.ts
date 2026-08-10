import type { ImportConfig, ImportCursor, ImportRun, ImportSource, ImportStats, ImportStatus } from "@domain/imports"
import { sql } from "drizzle-orm"
import { index, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const importJobs = latitudeSchema.table(
  "import_jobs",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    source: varchar("source", { length: 32 }).notNull().$type<ImportSource>(),
    status: varchar("status", { length: 32 }).notNull().$type<ImportStatus>(),
    config: jsonb("config").notNull().$type<ImportConfig>(),
    credentials: text("credentials"),
    cursor: jsonb("cursor").$type<ImportCursor>(),
    stats: jsonb("stats").notNull().$type<ImportStats>(),
    runs: jsonb("runs").notNull().$type<readonly ImportRun[]>(),
    error: text("error"),
    cancelledAt: tzTimestamp("cancelled_at"),
    startedAt: tzTimestamp("started_at"),
    finishedAt: tzTimestamp("finished_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("import_jobs"),
    index("import_jobs_org_status_idx").on(t.organizationId, t.status),
    index("import_jobs_org_project_created_idx").on(t.organizationId, t.projectId, t.createdAt),
    // Covers `created` too, so the org's slot is claimed by the insert rather than by the
    // later flip to `queued` — which is what keeps a concurrent create failing on `save`,
    // where the violation is mapped to a typed ConflictError.
    uniqueIndex("import_jobs_org_active_uq")
      .on(t.organizationId)
      .where(sql`${t.status} in ('created', 'queued', 'running')`),
  ],
)
