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
  /**
   * Unconditional watermark set — the re-enable cursor jump for a destination
   * with a historical boundary advances the live cursor to `now` so the gap is
   * filled by an explicit backfill instead of mistreated on the live path. Not a
   * CAS: callers hold an exclusive moment (resume/enable), not a concurrent run.
   */
  setWatermark(input: {
    readonly destinationId: DestinationId
    readonly source: DestinationSource
    readonly watermark: SourceCursor
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /** Edits a source's config and/or enablement status (settings UI); cursor untouched. */
  updateConfig(input: UpdateSourceConfigInput): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Extends backfill coverage leftward: `coverage_start_at := least(coverage_start_at, to)`.
   * Monotonic (never moves forward), so it's safe to call after any backfill — a
   * resume gap-fill (whose floor sits inside existing coverage) is a no-op.
   */
  extendCoverageStart(input: {
    readonly destinationId: DestinationId
    readonly source: DestinationSource
    readonly to: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Hard one-chain-per-source guard: atomically claims the in-flight marker for a
   * starting backfill, but **only if no chain is already running** — `backfill_started_at`
   * is null, or its heartbeat (`updated_at`) predates `staleBefore` (a wedged chain).
   * Returns whether this caller claimed it. The advisory marker + UI disable can't stop
   * a racing second trigger (two tabs, an API retry) from double-running a chain; this
   * CAS can. On success sets `backfill_started_at = at` and bumps the heartbeat.
   */
  acquireBackfill(input: {
    readonly destinationId: DestinationId
    readonly source: DestinationSource
    readonly at: Date
    readonly staleBefore: Date
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Marks a backfill chain in flight (`at = Date`) or clears it (`at = null`).
   * Set when a chain actually starts (real work), cleared on its completion or
   * terminal failure — the UI's "backfill in progress" signal. Prefer
   * {@link acquireBackfill} to *start* a chain; this is the unconditional clear/set.
   */
  setBackfillStartedAt(input: {
    readonly destinationId: DestinationId
    readonly source: DestinationSource
    readonly at: Date | null
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Advances the in-flight backfill's progress frontier (the history instant the
   * cursor has reached), written once per window. Bumps `updated_at`, so it also
   * acts as the chain heartbeat (a stale `updated_at` while `backfill_started_at`
   * is set means the chain wedged).
   */
  setBackfillProgress(input: {
    readonly destinationId: DestinationId
    readonly source: DestinationSource
    readonly at: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Re-opens the full backfill range for every source of a destination by setting
   * `coverage_start_at = created_at`. Used on a credentials/host change: prior
   * deliveries may have gone to a different (wrong) target, so coverage can no
   * longer be trusted as "imported". Unlike {@link extendCoverageStart} this moves
   * coverage *forward* (back to creation), so a re-backfill re-imports the history.
   */
  resetCoverageStart(destinationId: DestinationId): Effect.Effect<void, RepositoryError, SqlClient>
  /** Cascade when a destination is deleted; source rows go with it. */
  deleteByDestinationId(destinationId: DestinationId): Effect.Effect<void, RepositoryError, SqlClient>
}

export class DestinationSourceStateRepository extends Context.Service<
  DestinationSourceStateRepository,
  DestinationSourceStateRepositoryShape
>()("@domain/destinations/DestinationSourceStateRepository") {}
