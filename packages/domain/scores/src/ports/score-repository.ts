import type {
  IssueId,
  NotFoundError,
  ProjectId,
  RepositoryError,
  ScoreId,
  SessionId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
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

export interface ScoreRepositoryShape {
  findById(id: ScoreId): Effect.Effect<Score, NotFoundError | RepositoryError, SqlClient>
  save(score: Score): Effect.Effect<void, RepositoryError, SqlClient>
  assignIssueIfUnowned(input: {
    readonly scoreId: ScoreId
    readonly issueId: IssueId
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
  listByIssueId(input: {
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError, SqlClient>
  /**
   * Finds an existing flagger-authored published score by (flaggerId, traceId).
   * Only returns published scores (`draftedAt = null`) where
   * `(source, sourceId) === ("flagger", <flaggerId>)`. Used to make the
   * deterministic-match path idempotent under BullMQ retries.
   */
  findFlaggerPublishedByTraceAndFlaggerId(input: {
    readonly projectId: ProjectId
    readonly flaggerId: string
    readonly traceId: TraceId
  }): Effect.Effect<Score | null, RepositoryError, SqlClient>
}

export class ScoreRepository extends ServiceMap.Service<ScoreRepository, ScoreRepositoryShape>()(
  "@domain/scores/ScoreRepository",
) {}
