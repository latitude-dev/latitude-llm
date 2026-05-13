import type { Report, ReportVersion, WrappedReportType } from "@domain/spans"
import { index, integer, jsonb, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Persisted Wrapped reports. One row per per-project pipeline run; rows are
 * immutable snapshots. The CUID `id` is what the public share URL
 * (`/wrapped/<id>`) resolves against — unguessable enough to be the only
 * access control for the no-auth web view.
 *
 * `type` discriminates the data source — today only `"claude_code"`, but
 * future Wrapped types (Openclaw, Codex, …) live in the same table and
 * carry their own `type` value.
 *
 * `report_version` narrows the JSONB `report` blob to the right schema in
 * the type's `SCHEMA_BY_VERSION` map. Combined with `type`, the row is
 * fully self-describing for renderer dispatch.
 *
 * `owner_name` is a snapshot of the org owner's display name at generation
 * time; it's only used by the web view's greeting (the email keeps its
 * per-recipient `userName`).
 */
export const wrappedReports = latitudeSchema.table(
  "wrapped_reports",
  {
    id: cuid("id").primaryKey(),
    type: varchar("type", { length: 32 }).$type<WrappedReportType>().notNull().default("claude_code"),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    windowStart: tzTimestamp("window_start").notNull(),
    windowEnd: tzTimestamp("window_end").notNull(),
    ownerName: varchar("owner_name", { length: 256 }).notNull(),
    reportVersion: integer("report_version").$type<ReportVersion>().notNull(),
    // Today always shaped as the Claude Code `Report` (since `type` is
    // `claude_code`). Becomes a discriminated union once V2 / other types
    // ship; readers narrow via `(type, reportVersion)` on the row.
    report: jsonb("report").$type<Report>().notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("wrapped_reports"),
    index("wrapped_reports_organization_id_idx").on(t.organizationId),
    // Supports the sidebar's "most recent Wrapped for this (project, type)"
    // lookup with a single index seek; `created_at DESC` matches the
    // ORDER BY clause in `findLatestForProject`.
    index("wrapped_reports_type_project_recent_idx").on(t.type, t.projectId, t.createdAt.desc()),
  ],
)
