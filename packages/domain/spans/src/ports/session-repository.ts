import type { FilterSet, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
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
  }): Effect.Effect<SessionListPage, RepositoryError>
  /** @deprecated Use `listByProjectId` */
  findByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SessionListOptions
  }): Effect.Effect<SessionListPage, RepositoryError>

  countByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
  }): Effect.Effect<number, RepositoryError>

  aggregateMetricsByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
  }): Effect.Effect<SessionMetrics | null, RepositoryError>

  distinctFilterValues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly column: SessionDistinctColumn
    readonly limit?: number
    readonly search?: string
  }): Effect.Effect<readonly string[], RepositoryError>
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

export class SessionRepository extends ServiceMap.Service<SessionRepository, SessionRepositoryShape>()(
  "@domain/spans/SessionRepository",
) {}
