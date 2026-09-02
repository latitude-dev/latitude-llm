import type {
  NotFoundError,
  ProjectId,
  RepositoryError,
  ScoreId,
  SessionId,
  SignalId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import { z } from "zod"
import type { Score, ScoreSourceType } from "../entities/score.ts"

export const scoreDraftModeSchema = z.enum(["exclude", "include", "only"])
export type ScoreDraftMode = z.infer<typeof scoreDraftModeSchema>

export interface ScoreListOptions {
  readonly limit?: number
  readonly offset?: number
  readonly draftMode?: ScoreDraftMode
  /** Drop failed, non-errored evaluation runs that have no stamped signal (`signalId` is null). */
  readonly omitAbsentEvaluations?: boolean
}

export interface ScoreListPage {
  readonly items: readonly Score[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface TraceAnnotationCounts {
  readonly traceId: TraceId
  readonly positiveCount: number
  readonly negativeCount: number
}

export interface ScoreRepositoryShape {
  findById(id: ScoreId): Effect.Effect<Score, NotFoundError | RepositoryError, SqlClient>
  save(score: Score): Effect.Effect<void, RepositoryError, SqlClient>
  assignSignalIfUnowned(input: {
    readonly scoreId: ScoreId
    readonly signalId: SignalId
    readonly updatedAt: Date
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Bulk move of every score owned by the given signals onto one survivor, for
   * candidate consolidation. Unconditional, unlike `assignSignalIfUnowned` —
   * these scores are already owned, and moving them is the point.
   *
   * `earliestCreatedAt` is the oldest `created_at` among the rows actually
   * moved, and it is what bounds the matching ClickHouse mutation. It cannot be
   * derived from the signals instead: a replayed annotation is older than the
   * signal it was later assigned to, so a bound taken from the loser's own
   * `created_at` would skip those rows and leave the survivor's occurrence count
   * permanently short.
   */
  reassignSignal(input: {
    readonly projectId: ProjectId
    readonly fromSignalIds: readonly SignalId[]
    readonly toSignalId: SignalId
    readonly updatedAt: Date
  }): Effect.Effect<{ readonly count: number; readonly earliestCreatedAt: Date | null }, RepositoryError, SqlClient>
  /**
   * Oldest `created_at` among the signal's scores, or null when it owns none.
   *
   * Bounds the partition range the ClickHouse reconciliation has to walk. Taken
   * from the survivor's own scores because Postgres already holds the merged
   * set, and because a replayed annotation can be older than any signal in the
   * merge.
   */
  findEarliestCreatedAtBySignalId(input: {
    readonly projectId: ProjectId
    readonly signalId: SignalId
  }): Effect.Effect<Date | null, RepositoryError, SqlClient>
  delete(id: ScoreId): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Checks whether a canonical persisted evaluation score already exists in the
   * current live-monitoring turn scope. When `sessionId` is present the scope
   * is session-based; otherwise it falls back to the specific trace id.
   */
  existsByEvaluationIdAndScope(input: {
    readonly projectId: ProjectId
    readonly evaluationId: string
    readonly traceId: TraceId
    readonly sessionId?: SessionId | null
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /** Canonical persisted evaluation score for one `(evaluationId, traceId)` pair, or `null`. */
  findByEvaluationIdAndTraceId(input: {
    readonly projectId: ProjectId
    readonly evaluationId: string
    readonly traceId: TraceId
  }): Effect.Effect<Score | null, RepositoryError, SqlClient>
  listByProjectId(input: {
    readonly projectId: ProjectId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  /** When `sourceId` is omitted, lists all scores for the project with the given `source` (e.g. every annotation). */
  listBySourceId(input: {
    readonly projectId: ProjectId
    readonly source: ScoreSourceType
    readonly sourceId?: string
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  listByTraceId(input: {
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly source?: ScoreSourceType
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  /**
   * Lists scores across a set of traces (e.g. every trace in a session). Scopes
   * by `trace_id IN (...)` rather than `session_id` so it works for orphan
   * sessions, whose scores carry no `session_id`. Optionally filtered by source.
   */
  listByTraceIds(input: {
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly source?: ScoreSourceType
    /** Narrows to one signal's scores, so a session with more scores than fit a page still yields them. */
    readonly signalId?: SignalId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  /** Per-trace +/- score counts. Omit `source` for all sources; pass `"annotation"` for the public API fields. Signal-less absent evaluation runs are excluded from the negative count. */
  countAnnotationsByTraceIds(input: {
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly source?: ScoreSourceType
    readonly options?: Pick<ScoreListOptions, "draftMode">
  }): Effect.Effect<readonly TraceAnnotationCounts[], RepositoryError, SqlClient>
  listBySessionId(input: {
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  listBySpanId(input: {
    readonly projectId: ProjectId
    readonly spanId: SpanId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  listBySignalId(input: {
    readonly projectId: ProjectId
    readonly signalId: SignalId
    /** Optional filter by score source (e.g. `annotation` or `evaluation`). */
    readonly source?: ScoreSourceType
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  /**
   * Distinct sessions a signal has been seen in since `since`, which is the
   * evidence unit the promotion gate counts.
   *
   * Sessions, not scores: one long session can trip the same flagger many times
   * and one trace can carry several annotations, none of which is independent
   * evidence. A score with no `session_id` counts as its own session keyed by
   * `trace_id`, and failing that by its own id, so annotations from
   * non-session instrumentation still count exactly once.
   */
  countDistinctSessionsBySignalId(input: {
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly since: Date
    /**
     * Lock the matching score rows until the current transaction commits.
     * `findByIdForUpdate` on the signal does not serialize annotation delete,
     * which never takes that lock. Only meaningful inside a transaction.
     */
    readonly forUpdate?: boolean
  }): Effect.Effect<number, RepositoryError, SqlClient>
  findPublishedSystemAnnotationByTraceAndFeedback(input: {
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly feedback: string
  }): Effect.Effect<Score | null, RepositoryError, SqlClient>
  /**
   * Published flagger-authored annotations for one session, newest first,
   * bounded by `limit`. Backs the flagger anchor dedup.
   */
  listPublishedSystemAnnotationsBySession(input: {
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly limit?: number
  }): Effect.Effect<readonly Score[], RepositoryError, SqlClient>
  /**
   * Returns the distinct `metadata.flaggerSlug` values found across an issue's
   * published flagger-authored annotation occurrences (i.e. `source =
   * "annotation"`, `sourceId = "SYSTEM"`, `draftedAt IS NULL`), ordered with
   * the most-recently-firing flagger first.
   *
   * Implementations sample the most-recent
   * `SIGNAL_FLAGGER_SLUG_SAMPLE_LIMIT` annotation occurrences on the issue
   * before collapsing to distinct slugs — slug variety converges fast, so
   * this keeps the scan cheap for noisy issues (same sampling rationale as
   * `aggregateTagsBySignals` in the CH analytics path).
   */
  listFlaggerSlugsBySignalId(input: {
    readonly projectId: ProjectId
    readonly signalId: SignalId
  }): Effect.Effect<readonly string[], RepositoryError, SqlClient>
}

export class ScoreRepository extends Context.Service<ScoreRepository, ScoreRepositoryShape>()(
  "@domain/scores/ScoreRepository",
) {}
