import type { OrganizationId, ProjectId, RepositoryError, SpanId, TraceId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Span, SpanDetail } from "../entities/span.ts"

/**
 * Repository port for spans (ClickHouse).
 */
export interface SpanRepositoryShape {
  insert(spans: readonly SpanDetail[]): Effect.Effect<void, RepositoryError>

  findByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly traceId: TraceId
  }): Effect.Effect<readonly Span[], RepositoryError>

  findByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SpanListOptions
  }): Effect.Effect<readonly Span[], RepositoryError>

  findBySpanId(input: {
    readonly organizationId: OrganizationId
    readonly traceId: TraceId
    readonly spanId: SpanId
  }): Effect.Effect<SpanDetail | null, RepositoryError>
}

export interface SpanListOptions {
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit?: number
  readonly offset?: number
}

export class SpanRepository extends ServiceMap.Service<SpanRepository, SpanRepositoryShape>()(
  "@domain/spans/SpanRepository",
) {}
