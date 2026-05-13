import type { NotFoundError, ProjectId, RepositoryError, SqlClient, WrappedReportId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { WrappedReportRecord, WrappedReportType } from "../entities/wrapped-report-record.ts"

/** Light projection of a row — id + createdAt only, no JSONB validation. */
export interface WrappedReportSummary {
  readonly id: WrappedReportId
  readonly createdAt: Date
}

/**
 * Read + write port for persisted Wrapped reports.
 *
 *  - `save` — used by the per-project worker after the type-specific build
 *    use-case produces a fresh report. Always an insert; rows are immutable.
 *  - `findById` — used by the public `/wrapped/<id>` route to resolve a
 *    share URL. Today the adapter validates the JSONB blob against the
 *    Claude-Code schema for any row with `type === "claude_code"`; future
 *    types will dispatch on `(type, reportVersion)`.
 *  - `findLatestForProject` — used by the in-app sidebar to surface a
 *    "this week's Wrapped" shortcut. Returns the most recent row for the
 *    given `(projectId, type)` created on or after `sinceCreatedAt`, or
 *    `null` when none exists. RLS scopes the visible rows to the caller's
 *    org; this method intentionally skips the JSONB schema parse since
 *    the caller only needs the id for navigation.
 */
export interface WrappedReportRepositoryShape {
  save: (record: WrappedReportRecord) => Effect.Effect<void, RepositoryError, SqlClient>

  findById: (id: WrappedReportId) => Effect.Effect<WrappedReportRecord, NotFoundError | RepositoryError, SqlClient>

  findLatestForProject: (params: {
    readonly projectId: ProjectId
    readonly type: WrappedReportType
    readonly sinceCreatedAt: Date
  }) => Effect.Effect<WrappedReportSummary | null, RepositoryError, SqlClient>
}

export class WrappedReportRepository extends Context.Service<WrappedReportRepository, WrappedReportRepositoryShape>()(
  "@domain/spans/WrappedReportRepository",
) {}
