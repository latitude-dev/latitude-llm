import type { NotFoundError, OrganizationId, ProjectId, RepositoryError, SpanId, TraceId } from "@domain/shared"
import { type Effect } from "effect"
import { EffectService } from "@repo/effect-service"
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
  insert(spans: readonly SpanDetail[]): Effect.Effect<void, RepositoryError>

  listByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly traceId: TraceId
  }): Effect.Effect<readonly Span[], RepositoryError>

  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SpanListOptions
  }): Effect.Effect<readonly Span[], RepositoryError>

  findBySpanId(input: {
    readonly organizationId: OrganizationId
    readonly traceId: TraceId
    readonly spanId: SpanId
  }): Effect.Effect<SpanDetail, NotFoundError | RepositoryError>

  findMessagesForTrace(input: {
    readonly organizationId: OrganizationId
    readonly traceId: TraceId
  }): Effect.Effect<readonly SpanMessagesData[], RepositoryError>
}

export interface SpanListOptions {
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit?: number
  readonly offset?: number
}

export class SpanRepository extends EffectService<SpanRepository, SpanRepositoryShape>()(
  "@domain/spans/SpanRepository",
) {}
