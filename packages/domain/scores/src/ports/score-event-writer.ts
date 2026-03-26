import type { RepositoryError, ScoreId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

export class ScoreEventWriter extends ServiceMap.Service<
  ScoreEventWriter,
  {
    scoreImmutable(input: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: ScoreId
      readonly issueId: string | null
    }): Effect.Effect<void, RepositoryError>
  }
>()("@domain/scores/ScoreEventWriter") {}
