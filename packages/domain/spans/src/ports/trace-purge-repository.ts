import type { OrganizationId, ProjectId, RepositoryError, SessionId, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"

/** Rows per store, keyed by store name; the shape a deletion receipt reports. */
export type PurgedRowCounts = Readonly<Record<string, number>>

export interface TracePurgeScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export interface TracePurgeTracesInput extends TracePurgeScope {
  readonly traceIds: readonly TraceId[]
  readonly includeDatasetRows?: boolean
}

/**
 * Hard-deletes telemetry and everything derived from it. Counting is separate from
 * deleting so a receipt counted once stays right when a part-way purge is retried.
 * Session keys are resolved before the traces are purged, and sessions are purged after,
 * so the rebuilt rollups see only surviving spans.
 */
export interface TracePurgeRepositoryShape {
  /**
   * Every session key the given traces can appear under in the `sessions` rollup: their
   * span and trace `session_id`s, plus the trace ids themselves, which key sessionless spans.
   * Reads `traces` as well as `spans`, so it still resolves after a part-way purge.
   */
  listSessionIdsByTraceIds(
    input: TracePurgeScope & { readonly traceIds: readonly TraceId[] },
  ): Effect.Effect<readonly SessionId[], RepositoryError>

  /**
   * Rows each trace-keyed table holds for the traces (spans, trace rollups, search, trace-level scores, memory),
   * plus the dataset rows copied from them when `includeDatasetRows` is set.
   */
  countTraceRows(input: TracePurgeTracesInput): Effect.Effect<PurgedRowCounts, RepositoryError>

  /** Deletes every trace-keyed row; `traces` goes last so a part-way failure stays listable. */
  purgeTraces(input: TracePurgeTracesInput): Effect.Effect<void, RepositoryError>

  /** Rows the session rollups and session-scoped derived tables hold for the session keys. */
  countSessionRows(
    input: TracePurgeScope & { readonly sessionIds: readonly SessionId[] },
  ): Effect.Effect<PurgedRowCounts, RepositoryError>

  /**
   * Deletes the session rollups and all session-scoped derived data (analyses,
   * taxonomy, flaggers, session-level scores) of the given session keys, then rebuilds
   * the rollup of every session that still has spans.
   */
  purgeSessions(
    input: TracePurgeScope & { readonly sessionIds: readonly SessionId[] },
  ): Effect.Effect<{ readonly rebuiltSessions: number }, RepositoryError>
}

export class TracePurgeRepository extends Context.Service<TracePurgeRepository, TracePurgeRepositoryShape>()(
  "@domain/spans/TracePurgeRepository",
) {}
