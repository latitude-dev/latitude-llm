import type { ChSqlClient, FilterSet, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { type Effect, Context } from "effect"
import type { Session } from "../entities/session.ts"
import type { NumericRollup } from "./trace-repository.ts"

/**
 * Repository port for sessions (ClickHouse materialized view).
 *
 * No insert method — the sessions table is populated automatically
 * by a materialized view on each insert into spans.
 */
export interface SessionRepositoryShape {
  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SessionListOptions
  }): Effect.Effect<SessionListPage, RepositoryError, ChSqlClient>

  countByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
  }): Effect.Effect<number, RepositoryError, ChSqlClient>

  aggregateMetricsByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
  }): Effect.Effect<SessionMetrics, RepositoryError, ChSqlClient>

  distinctFilterValues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly column: SessionDistinctColumn
    readonly limit?: number
    readonly search?: string
  }): Effect.Effect<readonly string[], RepositoryError, ChSqlClient>
}

export type SessionDistinctColumn = "tags" | "models" | "providers" | "serviceNames"

export interface SessionListCursor {
  readonly sortValue: string
  readonly sessionId: string
}

export interface SessionListOptions {
  readonly limit?: number
  readonly cursor?: SessionListCursor
  readonly sortBy?: string
  readonly sortDirection?: "asc" | "desc"
  readonly filters?: FilterSet
}

export interface SessionListPage {
  readonly items: readonly Session[]
  readonly hasMore: boolean
  readonly nextCursor?: SessionListCursor
}

export interface SessionMetrics {
  readonly durationNs: NumericRollup
  readonly costTotalMicrocents: NumericRollup
  readonly spanCount: NumericRollup
}

const zeroRollup = (): NumericRollup => ({ min: 0, max: 0, avg: 0, median: 0, sum: 0 })

/** Metrics when no sessions match the filter (same shape as a populated aggregate). */
export const emptySessionMetrics = (): SessionMetrics => ({
  durationNs: zeroRollup(),
  costTotalMicrocents: zeroRollup(),
  spanCount: zeroRollup(),
})

export class SessionRepository extends Context.Service<SessionRepository, SessionRepositoryShape>()(
  "@domain/spans/SessionRepository",
) {}
