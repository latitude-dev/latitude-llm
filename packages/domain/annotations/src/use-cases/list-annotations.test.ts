import { type ScoreListOptions, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { listTraceAnnotationsUseCase } from "./list-annotations.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const traceId = "t".repeat(32)

describe("listTraceAnnotationsUseCase", () => {
  // Outcome's judge persists a passed score for every session it finds
  // successful, so the rate has a denominator. That is a measurement, not
  // something a reviewer wrote, and it would otherwise appear here as a green
  // card nobody authored. Excluded in the query rather than over the returned
  // page, or a hidden verdict would spend the page budget.
  it("asks the repository to exclude a flagger's positive reference verdict", async () => {
    let options: ScoreListOptions | undefined
    const { repository } = createFakeScoreRepository({
      listByTraceId: (input) => {
        options = input.options
        return Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 })
      },
    })

    await Effect.runPromise(
      listTraceAnnotationsUseCase({ projectId, traceId }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, repository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
          ),
        ),
      ),
    )

    expect(options).toMatchObject({ omitFlaggerReferenceVerdicts: true })
  })
})
