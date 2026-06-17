import type { DestinationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Destination } from "../entities/destination.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import type { DestinationSourceCursor } from "../entities/destination-source-cursor.ts"
import type { SourceCursor } from "./destination-source-reader.ts"

export interface AdvanceSourceCursorInput {
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  /** The position the run started from; the write only applies while the row still holds it. */
  readonly expected: SourceCursor
  readonly next: SourceCursor
}

/** Per-source bookkeeping (`last_run_at`, idle-backoff counter) — never the cursor position. */
export interface UpdateSourceRunStateInput {
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  readonly consecutiveEmptyRuns: number
  readonly lastRunAt: Date
}

/** A due `(destination, source)` pair: the destination carries config/credentials/status, the cursor its position + backoff. */
export interface DueDestinationSource {
  readonly destination: Destination
  readonly cursor: DestinationSourceCursor
}

export interface DestinationSourceCursorRepositoryShape {
  /** Seeds a source's cursor (called when a destination is created); watermark = creation time. */
  create(cursor: DestinationSourceCursor): Effect.Effect<void, RepositoryError, SqlClient>
  findByDestinationAndSource(input: {
    readonly destinationId: DestinationId
    readonly source: DestinationSource
  }): Effect.Effect<DestinationSourceCursor | null, RepositoryError, SqlClient>
  /**
   * Due `(destination, source)` pairs at `now`: idle backoff applied as
   * `last_run_at + intervalMs × 2^consecutive_empty_runs ≤ now` (never-ran rows
   * always due), only for `active`, non-sandbox destinations. Cross-org by
   * design — drive through the admin Postgres client so RLS is bypassed. The
   * `destinations` flag gates only the settings UI; the sweep does not re-check it.
   */
  listDue(now: Date): Effect.Effect<readonly DueDestinationSource[], RepositoryError, SqlClient>
  /**
   * Optimistic compound-cursor advance: applies only while the row still holds
   * `expected`, returning whether the write claimed. A stale concurrent run can
   * never move the cursor backwards or double-advance it.
   */
  advanceCursor(input: AdvanceSourceCursorInput): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Persists per-source bookkeeping without touching the watermark — the cursor
   * moves only through the optimistic {@link advanceCursor}.
   */
  updateRunState(input: UpdateSourceRunStateInput): Effect.Effect<void, RepositoryError, SqlClient>
  /** Cascade when a destination is deleted; cursor history goes with it. */
  deleteByDestinationId(destinationId: DestinationId): Effect.Effect<void, RepositoryError, SqlClient>
}

export class DestinationSourceCursorRepository extends Context.Service<
  DestinationSourceCursorRepository,
  DestinationSourceCursorRepositoryShape
>()("@domain/destinations/DestinationSourceCursorRepository") {}
