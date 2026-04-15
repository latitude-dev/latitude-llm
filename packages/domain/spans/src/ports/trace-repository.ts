import type { OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
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
  }): Effect.Effect<readonly Trace[], RepositoryError>

  findByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }): Effect.Effect<TraceDetail | null, RepositoryError>
}

export interface TraceListOptions {
  readonly traceId?: string
  readonly status?: string
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit?: number
  readonly offset?: number
}

export class TraceRepository extends ServiceMap.Service<TraceRepository, TraceRepositoryShape>()(
  "@domain/spans/TraceRepository",
) {}
