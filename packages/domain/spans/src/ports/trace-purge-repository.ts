import type { OrganizationId, ProjectId, RepositoryError, SessionId, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"

/** Rows removed per store, keyed by store name; the shape a deletion receipt reports. */
export type PurgedRowCounts = Readonly<Record<string, number>>

export interface TracePurgeScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

/**
 * Hard-deletes telemetry and everything derived from it. A purge runs in three
 * ordered steps: `listSessionIdsByTraceIds` while the spans still exist, then
 * `purgeTraces`, then `purgeSessions` so the rebuilt rollups see only surviving spans.
 */
export interface TracePurgeRepositoryShape {
  /**
   * Effective session ids of the given traces: the span `session_id`, or the trace id
   * for sessionless traces, matching how the `sessions` rollup keys them.
   */
  listSessionIdsByTraceIds(
    input: TracePurgeScope & { readonly traceIds: readonly TraceId[] },
  ): Effect.Effect<readonly SessionId[], RepositoryError>

  /** Deletes every trace-keyed row (spans, trace rollups, search, trace-level scores, memory). */
  purgeTraces(
    input: TracePurgeScope & { readonly traceIds: readonly TraceId[] },
  ): Effect.Effect<PurgedRowCounts, RepositoryError>

  /**
   * Deletes the session rollups and all session-scoped derived data (analyses,
   * taxonomy, flaggers, session-level scores) of the given sessions, then rebuilds
   * the rollup of every session that still has spans.
   */
  purgeSessions(
    input: TracePurgeScope & { readonly sessionIds: readonly SessionId[] },
  ): Effect.Effect<{ readonly deleted: PurgedRowCounts; readonly rebuiltSessions: number }, RepositoryError>
}

export class TracePurgeRepository extends Context.Service<TracePurgeRepository, TracePurgeRepositoryShape>()(
  "@domain/spans/TracePurgeRepository",
) {}
