import type {
  ChSqlClient,
  FilterSet,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SessionId,
  SpanId,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
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
  readonly toolName: string
  readonly toolInput: string
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
}

/**
 * A tool span (`operation = execute_tool`) projected for the evaluation `session` context. `input` /
 * `output` are the raw tool I/O strings (the caller truncates). Returned by `listToolSpansBySessionId`.
 */
export interface SessionToolSpan {
  readonly traceId: TraceId
  readonly name: string
  readonly input: string
  readonly output: string
  readonly error: boolean
  readonly durationNs: number
}

/**
 * Compound watermark for ingestion-ordered window reads. `ingested_at` is
 * stamped once per ingest request batch, so many spans share an identical
 * millisecond — `spanId` breaks ties so a limit-truncated read can resume
 * without skipping same-timestamp siblings. The initial cursor uses an empty
 * `spanId` sentinel.
 */
export interface SpanIngestionCursor {
  readonly ingestedAt: Date
  readonly spanId: SpanId
}

export interface SpanIngestedAtWindow {
  readonly spans: readonly SpanDetail[]
  readonly nextCursor: SpanIngestionCursor | null
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
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly startTimeFrom?: Date
    readonly startTimeTo?: Date
  }): Effect.Effect<readonly Span[], RepositoryError, ChSqlClient>

  /**
   * Every span in a session. Membership mirrors the `sessions_mv` grouping key
   * (`coalesce(nullIf(session_id, ''), toString(trace_id))`), so it covers both
   * conversation-id sessions and orphan single-trace sessions (whose spans carry
   * no `session_id` and are keyed on their `trace_id`).
   */
  listBySessionId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly startTimeFrom?: Date
    readonly startTimeTo?: Date
  }): Effect.Effect<readonly Span[], RepositoryError, ChSqlClient>

  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SpanListOptions
  }): Effect.Effect<readonly Span[], RepositoryError, ChSqlClient>

  findBySpanId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly spanId: SpanId
    readonly startTimeFrom?: Date
    readonly startTimeTo?: Date
  }): Effect.Effect<SpanDetail, NotFoundError | RepositoryError, ChSqlClient>

  findMessagesForTrace(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly startTimeFrom: Date
    readonly startTimeTo: Date
  }): Effect.Effect<readonly SpanMessagesData[], RepositoryError, ChSqlClient>

  /**
   * The session's tool spans (`operation = execute_tool`), projected to name + I/O + error + duration.
   * Powers the `session.traces[].tools` evaluation context; membership mirrors `sessions_mv`
   * (see listBySessionId). The light `Span` projection omits tool I/O, hence this focused read.
   */
  listToolSpansBySessionId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }): Effect.Effect<readonly SessionToolSpan[], RepositoryError, ChSqlClient>

  /**
   * Same projection as findMessagesForTrace but across every trace in a
   * session (membership mirrors `sessions_mv`, see listBySessionId) — used to
   * attribute a session-wide conversation to spans from any of its traces.
   */
  findMessagesForSession(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly startTimeFrom: Date
    readonly startTimeTo: Date
  }): Effect.Effect<readonly SpanMessagesData[], RepositoryError, ChSqlClient>

  /**
   * The trace of the latest output-producing span across a set of traces —
   * `argMaxIf(trace_id, end_time, output_messages != '')`. Matches the session
   * materialization's "current state" output (same span-level argMax by
   * `end_time`), so the session panel's Conversation tab renders the trace whose
   * messages the session surfaces. Scoped by `traceIds` (orphan-safe). Returns
   * `null` when none of the traces produced output.
   */
  findLatestOutputTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<TraceId | null, RepositoryError, ChSqlClient>

  /**
   * Settled-row window read: deduped spans (`LIMIT 1 BY span_id`, newest
   * `ingested_at` wins) ordered by `(ingested_at, span_id)`, strictly after
   * the compound cursor and up to `windowEnd` inclusive, capped at `limit`.
   * `nextCursor` is the last returned pair (null on an empty window) — resume
   * from it to continue a limit-truncated window without losing spans.
   */
  listByIngestedAtWindow(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly cursor: SpanIngestionCursor
    readonly windowEnd: Date
    readonly limit: number
    readonly excludePayloads?: boolean
  }): Effect.Effect<SpanIngestedAtWindow, RepositoryError, ChSqlClient>

  /**
   * The most recent settled spans for a project, deduped (`LIMIT 1 BY span_id`,
   * newest `ingested_at` wins), newest first. A representative sample for
   * previews — not a paged read; no cursor.
   */
  listRecentDetailsByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly SpanDetail[], RepositoryError, ChSqlClient>

  /**
   * `ingested_at` of the (`limit`+1)-th most recent deduped span at or before
   * `windowEnd` — i.e. the exclusive lower bound that, fed as a window cursor,
   * yields only the most recent `limit` spans. `null` when ≤ `limit` deduped
   * spans exist at or before `windowEnd` (no cap needed). Powers the backfill
   * record cap.
   */
  findIngestedAtFloorForRecentLimit(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly windowEnd: Date
    readonly limit: number
  }): Effect.Effect<Date | null, RepositoryError, ChSqlClient>
}

export interface SpanListOptions {
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit?: number
  readonly offset?: number
  /** Row-local span predicate (`SPAN_FIELD_REGISTRY` DSL); AND-combined with the window. */
  readonly filters?: FilterSet
}

export class SpanRepository extends Context.Service<SpanRepository, SpanRepositoryShape>()(
  "@domain/spans/SpanRepository",
) {}
