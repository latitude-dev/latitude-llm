import type { DestinationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Destination } from "../entities/destination.ts"
import type {
  DestinationSource,
  DestinationSourceConfig,
  DestinationSourceStatus,
} from "../entities/destination-source.ts"
import type { DestinationSourceState } from "../entities/destination-source-state.ts"
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

/** Edits a source's per-source config and/or enablement status; cursor and bookkeeping untouched. */
export interface UpdateSourceConfigInput {
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  readonly config?: DestinationSourceConfig
  readonly status?: DestinationSourceStatus
}

/** A due `(destination, source)` pair: the destination carries kind/credentials/quarantine, the source-state its config, position + backoff. */
export interface DueDestinationSource {
  readonly destination: Destination
  readonly sourceState: DestinationSourceState
}

export interface DestinationSourceStateRepositoryShape {
  /** Seeds a source row (called when a destination is created); watermark = creation time. */
  create(sourceState: DestinationSourceState): Effect.Effect<void, RepositoryError, SqlClient>
  findByDestinationAndSource(input: {
    readonly destinationId: DestinationId
    readonly source: DestinationSource
  }): Effect.Effect<DestinationSourceState | null, RepositoryError, SqlClient>
  listByDestinationId(
    destinationId: DestinationId,
  ): Effect.Effect<readonly DestinationSourceState[], RepositoryError, SqlClient>
  /**
   * Due `(destination, source)` pairs at `now`: idle backoff applied as
   * `last_run_at + intervalMs × 2^consecutive_empty_runs ≤ now` (never-ran rows
   * always due), only for `enabled` sources of `active`, non-sandbox
   * destinations. Cross-org by design — drive through the admin Postgres client
   * so RLS is bypassed. The `destinations` flag gates only the settings UI; the
   * sweep does not re-check it.
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
  /** Edits a source's config and/or enablement status (settings UI); cursor untouched. */
  updateConfig(input: UpdateSourceConfigInput): Effect.Effect<void, RepositoryError, SqlClient>
  /** Cascade when a destination is deleted; source rows go with it. */
  deleteByDestinationId(destinationId: DestinationId): Effect.Effect<void, RepositoryError, SqlClient>
}

export class DestinationSourceStateRepository extends Context.Service<
  DestinationSourceStateRepository,
  DestinationSourceStateRepositoryShape
>()("@domain/destinations/DestinationSourceStateRepository") {}
