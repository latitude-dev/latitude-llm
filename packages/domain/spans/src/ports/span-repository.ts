import type { OrganizationId, ProjectId, RepositoryError, SpanId, TraceId } from "@domain/shared"
import type { Effect } from "effect"
import type { Span, SpanDetail } from "../entities/span.ts"

/**
 * Repository port for spans (ClickHouse).
 */
export interface SpanRepository {
  insert(spans: readonly SpanDetail[]): Effect.Effect<void, RepositoryError>

  findByTraceId(organizationId: OrganizationId, traceId: TraceId): Effect.Effect<readonly Span[], RepositoryError>

  findByProjectId(
    organizationId: OrganizationId,
    projectId: ProjectId,
    options: SpanListOptions,
  ): Effect.Effect<readonly Span[], RepositoryError>

  findBySpanId(
    organizationId: OrganizationId,
    traceId: TraceId,
    spanId: SpanId,
  ): Effect.Effect<SpanDetail | null, RepositoryError>
}

export interface SpanListOptions {
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit?: number
  readonly offset?: number
}
