import type {
  ChSqlClient,
  FilterSet,
  NotFoundError,
  OrganizationId,
  PercentileSessionFilterField,
  ProjectId,
  RepositoryError,
  SessionId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CohortBaselineData } from "../cohort-baselines.ts"
import type { Session, SessionDetail } from "../entities/session.ts"
import type { SessionSearchMatch } from "../entities/session-search-match.ts"
import type { MessageEmbeddingRole } from "../helpers/message-embedding.ts"
import type { NumericRollup, TraceDistribution, TraceTimeHistogramBucket } from "./trace-repository.ts"

/**
 * Repository port for sessions (ClickHouse materialized view).
 *
 * No insert method — the sessions table is populated automatically
 * by a materialized view on each insert into spans.
 */
export interface SessionRepositoryShape {
  /**
   * Baseline percentiles across every session in the project. Intentionally
   * ignores user filters — the goal is a stable "what's normal for this
   * project" reference.
   */
  getCohortBaseline(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly excludeSessionId?: SessionId
  }): Effect.Effect<CohortBaselineData, RepositoryError, ChSqlClient>

  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: SessionListOptions
  }): Effect.Effect<SessionListPage, RepositoryError, ChSqlClient>

  countByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly searchQuery?: string
  }): Effect.Effect<SessionCountResult, RepositoryError, ChSqlClient>

  aggregateMetricsByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
  }): Effect.Effect<SessionMetrics, RepositoryError, ChSqlClient>

  histogramByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly bucketSeconds: number
  }): Effect.Effect<readonly TraceTimeHistogramBucket[], RepositoryError, ChSqlClient>

  findBySessionId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }): Effect.Effect<SessionDetail, NotFoundError | RepositoryError, ChSqlClient>

  /**
   * Conversation messages in the order analyzed by conversation intelligence.
   *
   * The preferred source is trace_message_occurrences: distinct content hashes
   * ordered by first occurrence across the session. When occurrence rows are not
   * available yet, implementations fall back to the legacy SessionDetail
   * reconstruction so old sessions can still be analyzed.
   */
  findConversationSpineBySessionId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }): Effect.Effect<SessionConversationSpine, NotFoundError | RepositoryError, ChSqlClient>

  distinctFilterValues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly column: SessionDistinctColumn
    readonly limit?: number
    readonly search?: string
  }): Effect.Effect<readonly string[], RepositoryError, ChSqlClient>

  /**
   * Numeric distribution of one session column for the project, sampled at every
   * integer percentile (p0..p100 — 101 values). Mirrors `TraceRepository.getDistribution`
   * but computed against the session aggregate, since per-session and per-trace
   * distributions are independent (a session-cost distribution is not the same
   * as a trace-cost distribution). Intentionally ignores other user filters so
   * the visualization is stable while the user picks a threshold.
   */
  getDistribution(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly field: PercentileSessionFilterField
  }): Effect.Effect<TraceDistribution, RepositoryError, ChSqlClient>
}

export type SessionDistinctColumn = "tags" | "models" | "providers" | "serviceNames"

export interface SessionListCursor {
  readonly sortValue: string
  readonly secondaryValue?: string | undefined
  readonly sessionId: string
}

export interface SessionListOptions {
  readonly limit?: number
  readonly cursor?: SessionListCursor
  readonly sortBy?: string
  readonly sortDirection?: "asc" | "desc"
  readonly filters?: FilterSet
  readonly searchQuery?: string
}

export interface SessionListPage {
  readonly items: readonly Session[]
  readonly hasMore: boolean
  readonly nextCursor?: SessionListCursor
  /**
   * Per-result search match metadata, keyed by `sessionId`. Present only when
   * `SessionListOptions.searchQuery` was active for the request. Surfaced as
   * a parallel map (rather than embedded into `Session`) because the match is
   * per result, not a property of the session entity itself.
   */
  readonly searchMatches?: Readonly<Record<string, SessionSearchMatch>>
}

/**
 * Return shape for `countByProjectId`. `totalCount` is always populated;
 * `matchingTraceCount` is only present when `searchQuery` was active, where
 * it counts matching traces (not sessions) across all matched sessions —
 * useful for "N traces across M sessions" headers on the search page.
 */
export interface SessionCountResult {
  readonly totalCount: number
  readonly matchingTraceCount?: number
}

export interface SessionMetrics {
  readonly durationNs: NumericRollup
  readonly costTotalMicrocents: NumericRollup
  readonly spanCount: NumericRollup
  readonly tokensTotal: NumericRollup
  readonly timeToFirstTokenNs: NumericRollup
  readonly traceCount: number
}

export interface SessionConversationSpineMessage {
  readonly role: MessageEmbeddingRole
  readonly content: string
  /**
   * Heuristic marker for synthetic compaction summaries. They remain part of
   * the conversation record and segmentation input, but CI excludes them from
   * anchor-label scoring to avoid labels caused only by a summary sentence.
   */
  readonly isCompactionSummaryCandidate?: boolean
}

export interface SessionConversationSpine {
  readonly source: "trace_message_occurrences" | "session_detail"
  readonly messages: readonly SessionConversationSpineMessage[]
}

const zeroRollup = (): NumericRollup => ({
  min: 0,
  max: 0,
  avg: 0,
  median: 0,
  sum: 0,
})

/** Metrics when no sessions match the filter (same shape as a populated aggregate). */
export const emptySessionMetrics = (): SessionMetrics => ({
  durationNs: zeroRollup(),
  costTotalMicrocents: zeroRollup(),
  spanCount: zeroRollup(),
  tokensTotal: zeroRollup(),
  timeToFirstTokenNs: zeroRollup(),
  traceCount: 0,
})

export class SessionRepository extends Context.Service<SessionRepository, SessionRepositoryShape>()(
  "@domain/spans/SessionRepository",
) {}
