import type {
  ChSqlClient,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SpanId,
  TraceId,
} from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import type { Operation, Span, SpanDetail } from "../entities/span.ts"

/**
 * Minimal span shape with message content — used for conversation-to-span attribution.
 * Only returned by findMessagesForTrace; avoids fetching full SpanDetail for every span.
 */
export interface SpanMessagesData {
  readonly spanId: SpanId
  readonly operation: Operation
  readonly toolCallId: string
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
}

/**
 * Repository port for spans (ClickHouse).
 */
export interface SpanRepositoryShape {
  // TODO(repositories): rename insert -> save to keep repository write verbs
  // consistent across append-only and upsert-backed stores.
  insert(spans: readonly SpanDetail[]): Effect.Effect<void, RepositoryError, ChSqlClient>

  listByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly traceId: TraceId
  }): Effect.Effect<readonly Span[], RepositoryError, ChSqlClient>

  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SpanListOptions
  }): Effect.Effect<readonly Span[], RepositoryError, ChSqlClient>

  findBySpanId(input: {
    readonly organizationId: OrganizationId
    readonly traceId: TraceId
    readonly spanId: SpanId
  }): Effect.Effect<SpanDetail, NotFoundError | RepositoryError, ChSqlClient>

  findMessagesForTrace(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly startTimeFrom: Date
    readonly startTimeTo: Date
  }): Effect.Effect<readonly SpanMessagesData[], RepositoryError, ChSqlClient>
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
