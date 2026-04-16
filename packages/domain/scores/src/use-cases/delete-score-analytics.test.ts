import { ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ScoreAnalyticsRepository } from "../ports/score-analytics-repository.ts"
import { createFakeScoreAnalyticsRepository } from "../testing/fake-score-analytics-repository.ts"
import { deleteScoreAnalyticsUseCase } from "./delete-score-analytics.ts"

describe("deleteScoreAnalyticsUseCase", () => {
  it("deletes score analytics when it exists", async () => {
    const scoreId = ScoreId("ssssssssssssssssssssssss")
    const { repository, inserted } = createFakeScoreAnalyticsRepository()
    inserted.push(scoreId)

    const result = await Effect.runPromise(
      deleteScoreAnalyticsUseCase({ scoreId }).pipe(Effect.provideService(ScoreAnalyticsRepository, repository)),
    )

    expect(result).toEqual({ action: "deleted" })
    expect(inserted).not.toContain(scoreId)
  })

  it("returns not-found when score analytics does not exist", async () => {
    const scoreId = ScoreId("ssssssssssssssssssssssss")
    const { repository } = createFakeScoreAnalyticsRepository()

    const result = await Effect.runPromise(
      deleteScoreAnalyticsUseCase({ scoreId }).pipe(Effect.provideService(ScoreAnalyticsRepository, repository)),
    )

    expect(result).toEqual({ action: "not-found" })
  })
})
