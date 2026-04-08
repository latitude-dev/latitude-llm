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
import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"
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
}

export class ScoreRepository extends EffectService<ScoreRepository, ScoreRepositoryShape>()(
  "@domain/scores/ScoreRepository",
) {}
