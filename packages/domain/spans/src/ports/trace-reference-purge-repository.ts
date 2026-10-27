import type { ProjectId, RepositoryError, SessionId, SqlClient, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { PurgedRowCounts } from "./trace-purge-repository.ts"

/** What downstream consumers need to undo a deleted score's contribution (e.g. signal centroids). */
export interface PurgedScore {
  readonly scoreId: string
  readonly signalId: string | null
  readonly draftedAt: string | null
  readonly feedback: string
  readonly source: string
  readonly createdAt: string
}

/**
 * Hard-deletes the Postgres rows that reference purged telemetry: trace-level scores,
 * session-level scores of the affected sessions, and annotation queue items.
 */
export interface TraceReferencePurgeRepositoryShape {
  /** Rows `purge` would delete; counted separately so a receipt stays right across retries. */
  count(input: {
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly sessionIds: readonly SessionId[]
  }): Effect.Effect<PurgedRowCounts, RepositoryError, SqlClient>
  purge(input: {
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly sessionIds: readonly SessionId[]
  }): Effect.Effect<{ readonly scores: readonly PurgedScore[] }, RepositoryError, SqlClient>
}

export class TraceReferencePurgeRepository extends Context.Service<
  TraceReferencePurgeRepository,
  TraceReferencePurgeRepositoryShape
>()("@domain/spans/TraceReferencePurgeRepository") {}
