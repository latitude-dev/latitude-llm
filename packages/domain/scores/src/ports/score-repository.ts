import type {
  IssueId,
  NotFoundError,
  ProjectId,
  RepositoryError,
  ScoreId,
  SessionId,
  SpanId,
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
  findById(id: ScoreId): Effect.Effect<Score, NotFoundError | RepositoryError>
  save(score: Score): Effect.Effect<void, RepositoryError>
  assignIssueIfUnowned(input: {
    readonly scoreId: ScoreId
    readonly issueId: IssueId
    readonly updatedAt: Date
  }): Effect.Effect<boolean, RepositoryError>
  delete(id: ScoreId): Effect.Effect<void, RepositoryError>
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
  }): Effect.Effect<boolean, RepositoryError>
  /**
   * Checks whether a canonical persisted evaluation score already exists for
   * one concrete `(evaluationId, traceId)` pair.
   */
  existsByEvaluationIdAndTraceId(input: {
    readonly projectId: ProjectId
    readonly evaluationId: string
    readonly traceId: TraceId
  }): Effect.Effect<boolean, RepositoryError>
  listByProjectId(input: {
    readonly projectId: ProjectId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError>
  /** When `sourceId` is omitted, lists all scores for the project with the given `source` (e.g. every annotation). */
  listBySourceId(input: {
    readonly projectId: ProjectId
    readonly source: ScoreSource
    readonly sourceId?: string
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError>
  listByTraceId(input: {
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly source?: ScoreSource
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError>
  listBySessionId(input: {
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError>
  listBySpanId(input: {
    readonly projectId: ProjectId
    readonly spanId: SpanId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError>
  listByIssueId(input: {
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly options?: ScoreListOptions
  }): Effect.Effect<ScoreListPage, RepositoryError>
  /**
   * Finds an existing queue-backed draft annotation by (queueId, traceId).
   * Only returns draft annotations (draftedAt != null), never published rows.
   * Used for idempotency in system queue annotate workflows.
   */
  findQueueDraftByTraceId(input: {
    readonly projectId: ProjectId
    readonly queueId: string
    readonly traceId: TraceId
  }): Effect.Effect<Score | null, RepositoryError>
}

export class ScoreRepository extends ServiceMap.Service<ScoreRepository, ScoreRepositoryShape>()(
  "@domain/scores/ScoreRepository",
) {}
