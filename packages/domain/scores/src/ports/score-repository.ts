import type {
  SignalId,
  NotFoundError,
  ProjectId,
  RepositoryError,
  ScoreId,
  SessionId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import { z } from "zod"
import type { Score, ScoreSource } from "../entities/score.ts"

export const scoreDraftModeSchema = z.enum(["exclude", "include", "only"])
export type ScoreDraftMode = z.infer<typeof scoreDraftModeSchema>

export interface ScoreListOptions {
  readonly limit?: number
  readonly offset?: number
  readonly draftMode?: ScoreDraftMode
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
  /**
   * Checks whether a canonical persisted evaluation score already exists for
   * one concrete `(evaluationId, traceId)` pair.
   */
  existsByEvaluationIdAndTraceId(input: {
    readonly projectId: ProjectId
    readonly evaluationId: string
    readonly traceId: TraceId
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  listByProjectId(input: {
    readonly projectId: ProjectId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  /** When `sourceId` is omitted, lists all scores for the project with the given `source` (e.g. every annotation). */
  listBySourceId(input: {
    readonly projectId: ProjectId
    readonly source: ScoreSource
    readonly sourceId?: string
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  listByTraceId(input: {
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly source?: ScoreSource
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
    readonly source?: ScoreSource
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  countAnnotationsByTraceIds(input: {
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
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
    readonly source?: ScoreSource
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  findPublishedSystemAnnotationByTraceAndFeedback(input: {
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly feedback: string
  }): Effect.Effect<Score | null, RepositoryError, SqlClient>
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
