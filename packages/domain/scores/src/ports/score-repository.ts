import type { ProjectId, RepositoryError, ScoreId } from "@domain/shared"
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

export class ScoreRepository extends ServiceMap.Service<
  ScoreRepository,
  {
    findById(id: ScoreId): Effect.Effect<Score | null, RepositoryError>
    save(score: Score): Effect.Effect<void, RepositoryError>
    listByProjectId(input: {
      readonly projectId: ProjectId
      readonly options?: ScoreListOptions
    }): Effect.Effect<ScoreListPage, RepositoryError>
    listBySourceId(input: {
      readonly projectId: ProjectId
      readonly source: ScoreSource
      readonly sourceId: string
      readonly options?: ScoreListOptions
    }): Effect.Effect<ScoreListPage, RepositoryError>
  }
>()("@domain/scores/ScoreRepository") {}
