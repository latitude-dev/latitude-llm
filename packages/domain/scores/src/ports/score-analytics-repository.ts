import type { RepositoryError, ScoreId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Score } from "../entities/score.ts"

export class ScoreAnalyticsRepository extends ServiceMap.Service<
  ScoreAnalyticsRepository,
  {
    existsById(id: ScoreId): Effect.Effect<boolean, RepositoryError>
    insert(score: Score): Effect.Effect<void, RepositoryError>
  }
>()("@domain/scores/ScoreAnalyticsRepository") {}
