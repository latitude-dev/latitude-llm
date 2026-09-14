import type {
  ChSqlClient,
  ExternalUserId,
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
import type {
  CostSource,
  Operation,
  Span,
  SpanDetail,
  SpanStatusCode,
  SpanTokenCounts,
  ToolDefinition,
} from "../entities/span.ts"
import type { TraceConversationChunk } from "../entities/trace.ts"
import type {
  GenerationContentState,
  GenerationModelContextState,
  GenerationPricingState,
} from "../helpers/classify-generation-coverage.ts"
import type { GenerationContentBudget } from "../helpers/select-generation-content.ts"

/**
 * Minimal span shape with message content — used for conversation-to-span attribution.
 * Only returned by findMessagesForTrace; avoids fetching full SpanDetail for every span.
 */
export interface SpanMessagesData {
  readonly traceId: TraceId
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
 * A memory-operation span (`operation` ∈ the 7 GenAI memory ops) projected to the
 * memory attributes the ledger materializer needs. Read as scalar map lookups
 * (`attr_string['gen_ai.memory.…']`) so the potentially large
 * `gen_ai.memory.records` payload is fetched only for a trace's handful of
 * memory spans, never the whole attribute map. `recordsRaw` is the flattened
 * records JSON (empty when the opt-in content attribute is absent).
 */
export interface MemoryOperationSpan {
  readonly spanId: SpanId
  readonly traceId: TraceId
  readonly sessionId: SessionId
  readonly userId: ExternalUserId
  readonly operation: Operation
  readonly startTime: Date
  readonly endTime: Date
  readonly storeId: string
  readonly recordId: string
  readonly recordCount: number
  readonly queryText: string
  readonly recordsRaw: string
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
 * One generation-bearing span projected to the columns the Agent Score Cost and Speed readers use.
 *
 * Narrower than `Span` on purpose: a scoring window covers thousands of sessions, so the read
 * selects only these columns and carries content as a separate budgeted payload. `content` is
 * `null` when a read budget skipped the payload — `capturedBytes` still reports that it exists, so
 * a skipped payload reads as truncated coverage rather than as absent content.
 *
 * Carries no `sessionId`: subagent spans override `session_id` to their own value, so session
 * membership is resolved from the caller's trace map, never from the row.
 *
 * Foreground and subagent classification uses the structural columns (`operation`, `parentSpanId`,
 * `name`, `agentName`, `toolName`) that `buildAgentGraph` already relies on. The read deliberately
 * never touches `attr_string`: an interaction span's attribute map can hold the whole conversation,
 * so subscripting it across a scoring window is the OOM hazard every other session-wide span read
 * documents. An unclassifiable structure lowers coverage instead of being guessed.
 */
export interface SessionGenerationFact {
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly parentSpanId: string
  readonly operation: Operation
  readonly provider: string
  readonly model: string
  readonly responseModel: string
  readonly startTime: Date
  readonly endTime: Date
  readonly durationNs: number
  readonly name: string
  readonly toolName: string
  readonly agentName: string
  readonly tokens: SpanTokenCounts
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly costSource: CostSource
  readonly costPricedProvider: string
  readonly costPricedModel: string
  readonly isStreaming: boolean
  readonly timeToFirstTokenNs: number
  readonly finishReasons: readonly string[]
  readonly statusCode: SpanStatusCode
  readonly statusMessage: string
  readonly errorType: string
  readonly capturedBytes: SessionGenerationCapturedBytes
  readonly content: SessionGenerationContent | null
  readonly inputContentState: GenerationContentState
  readonly outputContentState: GenerationContentState
  readonly toolDefinitionContentState: GenerationContentState
  readonly pricingState: GenerationPricingState
  readonly modelContextState: GenerationModelContextState
  readonly modelContextLimitTokens: number | null
}

/** Stored payload sizes, so absent content stays distinguishable from a budget-skipped read. */
export interface SessionGenerationCapturedBytes {
  readonly inputMessages: number
  readonly outputMessages: number
  readonly toolDefinitions: number
}

export interface SessionGenerationContent {
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  readonly toolDefinitions: readonly ToolDefinition[]
}

/**
 * One `execute_tool` span projected for repetition, thrashing, and failure readers.
 *
 * `spanId` is the result identity (one span per call/result pair) and `toolCallId` the call
 * identity, so a repeated call keeps a stable id even when its span is re-ingested. Hashes are
 * computed server-side over whitespace-normalized payloads: the payloads themselves never leave
 * ClickHouse, so key-order differences can under-detect repetition but never invent it. Empty
 * captured input or output yields an empty hash, which readers must treat as unreadable.
 *
 * Message position for navigation comes from the conversation-to-span mapping, not from this fact;
 * that mapping is a display aid and is not exact later-prompt token attribution.
 */
export interface SessionToolCallFact {
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly parentSpanId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly normalizedToolName: string
  readonly inputHash: string
  readonly outputHash: string
  readonly inputBytes: number
  readonly outputBytes: number
  readonly startTime: Date
  readonly endTime: Date
  readonly durationNs: number
  readonly statusCode: SpanStatusCode
  readonly statusMessage: string
  readonly errorType: string
}

/**
 * Repository port for spans (ClickHouse).
 */
export interface SpanIdentity {
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly spanId: SpanId
}

export interface SpanRepositoryShape {
  // TODO(repositories): rename insert -> save to keep repository write verbs
  // consistent across append-only and upsert-backed stores.
  insert(spans: readonly SpanDetail[]): Effect.Effect<void, RepositoryError, ChSqlClient>

  /**
   * Identities from `spans` that already have a row in ClickHouse. Used to skip
   * re-inserts: `spans` is ReplacingMergeTree, but `traces_mv`/`sessions_mv`
   * add per inserted block, so a retry after a successful write would
   * permanently double rollup counts, tokens, cost, and duration.
   */
  listExistingIdentities(input: {
    readonly organizationId: OrganizationId
    readonly spans: readonly SpanIdentity[]
  }): Effect.Effect<readonly SpanIdentity[], RepositoryError, ChSqlClient>

  /**
   * Every span in a trace. The dynamic attribute maps
   * (`attrString`/`attrInt`/`attrFloat`/`attrBool`/`resourceString`) come back
   * empty for the same reason as `listBySessionId`: a trace's spans can each
   * carry whole conversations or memory records in their attributes, so reading
   * them here is a memory hazard — fetch a span's attributes via `findBySpanId`.
   */
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
   * no `session_id` and are keyed on their `trace_id`). The dynamic attribute
   * maps (`attrString`/`attrInt`/`attrFloat`/`attrBool`/`resourceString`) come
   * back empty: a session's span count is unbounded and instrumentors can put
   * whole conversations into attributes, so reading them here is a memory
   * hazard — fetch a span's attributes via `findBySpanId`.
   */
  listBySessionId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly startTimeFrom?: Date
    readonly startTimeTo?: Date
  }): Effect.Effect<readonly Span[], RepositoryError, ChSqlClient>

  /**
   * Every span belonging to any of `traceIds`, deduped by `(trace_id, span_id)`
   * (span ids are only unique within a trace). The authoritative way to read a
   * session's spans: a session's `traceIds` are resolved from the session
   * materialization, so this catches subagent spans that override `session_id`
   * to the child's own value and would be invisible to a `session_id` membership
   * scan. Attribute maps come back empty (same memory hazard as listBySessionId).
   */
  listByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly startTimeFrom?: Date
    readonly startTimeTo?: Date
  }): Effect.Effect<readonly Span[], RepositoryError, ChSqlClient>

  /**
   * The trace's memory-operation spans projected to their memory attributes (see
   * `MemoryOperationSpan`). Filtered on the indexed `operation` column, deduped by
   * newest `ingested_at`, ordered by `end_time`, `start_time`, `ingested_at`,
   * `span_id`. Unlike `listByTraceId` this
   * returns the memory attribute values (scalar map lookups, so no memory hazard)
   * because the ledger materializer needs the record content — but only for the
   * few memory spans in one trace.
   */
  listMemoryOperationSpansByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }): Effect.Effect<readonly MemoryOperationSpan[], RepositoryError, ChSqlClient>

  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SpanListOptions
  }): Effect.Effect<SpanListPage, RepositoryError, ChSqlClient>

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
   * A single span's own conversation as a paginated chunk: its
   * `system_instructions` + `input_messages` + `output_messages` concatenated
   * (system first), sliced by `offset`/`limit`. Twin of
   * `TraceRepository.findConversationChunk`, keyed on `(trace_id, span_id)` and
   * deduped by newest `ingested_at`. Powers the subagent conversation view.
   */
  findSpanConversationChunk(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly spanId: SpanId
    readonly offset: number
    readonly limit: number
  }): Effect.Effect<TraceConversationChunk, RepositoryError, ChSqlClient>

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
   * Settled-row window read: deduped spans (`LIMIT 1 BY trace_id, span_id`,
   * newest `ingested_at` wins) ordered by `(ingested_at, span_id)`, strictly
   * after the compound cursor and up to `windowEnd` inclusive, capped at `limit`.
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
   * The most recent settled spans for a project, deduped (`LIMIT 1 BY trace_id,
   * span_id`, newest `ingested_at` wins), newest first. A representative sample for
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

  /**
   * Compact generation facts for every span in `traceIds`, deduped by `(trace_id, span_id)`, with
   * content payloads loaded only while `contentBudget` allows. Two bounded queries regardless of
   * session count: one over the projected columns, one over the payloads that fit the budget.
   */
  listGenerationFactsByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly startTimeTo?: Date
    readonly contentBudget: GenerationContentBudget
    /** Maps a trace to the session whose budget its payloads draw from. */
    readonly sessionKeyByTraceId: ReadonlyMap<string, string>
  }): Effect.Effect<readonly SessionGenerationFact[], RepositoryError, ChSqlClient>

  /**
   * Compact tool-call facts for every `execute_tool` span in `traceIds`, deduped by
   * `(trace_id, span_id)`. Payload hashes are computed in ClickHouse so tool I/O — which can hold
   * whole files — is never transferred for a scoring window.
   */
  listToolCallFactsByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly startTimeTo?: Date
  }): Effect.Effect<readonly SessionToolCallFact[], RepositoryError, ChSqlClient>
}

export type SpanListOrderField = "startTime" | "duration" | "cost"
export type SpanListOrderDirection = "asc" | "desc"

/**
 * Keyset cursor for `listByProjectId` — points at the last returned row's
 * `(sortValue, traceId, spanId)` in the active ordering. Stable across concurrent inserts
 * (unlike an offset, which shifts when rows land mid-pagination). `sortValue` is
 * the raw sort-column value carried at full fidelity: a nanosecond ClickHouse
 * datetime for `startTime`, a base-10 integer for `duration`/`cost`. `field` and
 * `direction` pin the cursor to its ordering so it can't be replayed under a
 * different `orderBy`.
 */
export interface SpanListCursor {
  readonly field: SpanListOrderField
  readonly direction: SpanListOrderDirection
  readonly sortValue: string
  readonly traceId: TraceId
  readonly spanId: SpanId
}

export interface SpanListPage {
  readonly items: readonly Span[]
  readonly nextCursor: SpanListCursor | null
}

export interface SpanListOptions {
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit?: number
  /** Keyset cursor from a prior page's `nextCursor`; omit for the first page. */
  readonly cursor?: SpanListCursor
  /** Row-local span predicate (`SPAN_FIELD_REGISTRY` DSL); AND-combined with the window. */
  readonly filters?: FilterSet
  /** Sort key + direction. Defaults to `startTime` desc (newest first). */
  readonly orderBy?: { readonly field: SpanListOrderField; readonly direction: SpanListOrderDirection }
}

export class SpanRepository extends Context.Service<SpanRepository, SpanRepositoryShape>()(
  "@domain/spans/SpanRepository",
) {}
