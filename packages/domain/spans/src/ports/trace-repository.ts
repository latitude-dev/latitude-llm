import type { FilterSet, OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Trace, TraceDetail } from "../entities/trace.ts"

/**
 * Repository port for traces (ClickHouse materialized view).
 *
 * No insert method — the traces table is populated automatically
 * by a materialized view on each insert into spans.
 */
export interface TraceRepositoryShape {
  findByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: TraceListOptions
  }): Effect.Effect<TraceListPage, RepositoryError>

  countByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
  }): Effect.Effect<number, RepositoryError>

  findByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }): Effect.Effect<TraceDetail | null, RepositoryError>

  findByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<readonly TraceDetail[], RepositoryError>

  distinctFilterValues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly column: TraceDistinctColumn
    readonly limit?: number
    readonly search?: string
  }): Effect.Effect<readonly string[], RepositoryError>
}

export type TraceDistinctColumn = "tags" | "models" | "providers" | "serviceNames"

export interface TraceListCursor {
  readonly sortValue: string
  readonly traceId: string
}

export interface TraceListOptions {
  readonly limit?: number
  readonly cursor?: TraceListCursor
  readonly sortBy?: string
  readonly sortDirection?: "asc" | "desc"
  readonly filters?: FilterSet
}

export interface TraceListPage {
  readonly items: readonly Trace[]
  readonly hasMore: boolean
  readonly nextCursor?: TraceListCursor
}

export class TraceRepository extends ServiceMap.Service<TraceRepository, TraceRepositoryShape>()(
  "@domain/spans/TraceRepository",
) {}
