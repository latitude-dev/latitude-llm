import type { Report, ReportVersion } from "@domain/spans"

import { index, integer, jsonb, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Persisted Claude Code Wrapped reports. One row per per-project run of the
 * pipeline; rows are immutable snapshots. The CUID `id` is what the public
 * share URL (`/cc-wrapped/<id>`) resolves against — unguessable enough to be
 * the only access control for the no-auth web view.
 *
 * `report_version` integer narrows the JSONB `report` blob to the right
 * schema in `@domain/spans`' SCHEMA_BY_VERSION map, so when the data shape
 * evolves, old shares stay rendering with their original schema + template.
 *
 * `owner_name` is a snapshot of the org owner's display name at generation
 * time; it's only used by the web view's greeting (the email keeps its
 * per-recipient `userName`).
 */
export const claudeCodeWrappedReports = latitudeSchema.table(
  "claude_code_wrapped_reports",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    windowStart: tzTimestamp("window_start").notNull(),
    windowEnd: tzTimestamp("window_end").notNull(),
    ownerName: varchar("owner_name", { length: 256 }).notNull(),
    reportVersion: integer("report_version").$type<ReportVersion>().notNull(),
    report: jsonb("report").$type<Report>().notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("claude_code_wrapped_reports"),
    index("ccw_reports_organization_id_idx").on(t.organizationId),
    index("ccw_reports_project_window_idx").on(t.projectId, t.windowStart.desc()),
  ],
)
