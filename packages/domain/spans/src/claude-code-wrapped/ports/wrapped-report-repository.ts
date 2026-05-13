import type { NotFoundError, RepositoryError, SqlClient, WrappedReportId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { WrappedReportRecord } from "../entities/wrapped-report-record.ts"

/**
 * Read + write port for persisted Wrapped reports.
 *
 * Two operations:
 *  - `save` — used by the per-project worker after `buildReport` produces a
 *    fresh Report. Always an insert; rows are immutable.
 *  - `findById` — used by the public `/cc-wrapped/<id>` route to resolve a
 *    share URL. Validates the persisted blob against the schema indicated
 *    by the row's `reportVersion`, so old shares stay rendering even after
 *    the current shape moves on.
 */
export interface WrappedReportRepositoryShape {
  save: (record: WrappedReportRecord) => Effect.Effect<void, RepositoryError, SqlClient>

  findById: (id: WrappedReportId) => Effect.Effect<WrappedReportRecord, NotFoundError | RepositoryError, SqlClient>
}

export class WrappedReportRepository extends Context.Service<WrappedReportRepository, WrappedReportRepositoryShape>()(
  "@domain/spans/WrappedReportRepository",
) {}
