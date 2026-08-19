import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { reconcileConsolidatedScoresUseCase } from "./reconcile-consolidated-scores.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const survivorId = "survivorxxxxxxxxxxxxxxxx"
const loserId = "loserxxxxxxxxxxxxxxxxxxx"

const scoresCreatedFrom = "2026-01-01T12:00:00.000Z"

const run = (
  overrides: Partial<Parameters<typeof reconcileConsolidatedScoresUseCase>[0]> = {},
  fake = createFakeScoreAnalyticsRepository(),
) => {
  const effect = reconcileConsolidatedScoresUseCase({
    projectId,
    survivorId,
    loserIds: [loserId],
    scoresMoved: 3,
    scoresCreatedFrom,
    ...overrides,
  }).pipe(
    Effect.provideService(ScoreAnalyticsRepository, fake.repository),
    Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
  )

  return Effect.runPromise(effect).then((result) => ({ result, reassignments: fake.reassignments }))
}

describe("reconcileConsolidatedScoresUseCase", () => {
  it("moves the absorbed signals' scores onto the survivor", async () => {
    const { result, reassignments } = await run()

    expect(result).toEqual({ action: "reconciled" })
    expect(reassignments).toEqual([
      { fromSignalIds: [loserId], toSignalId: survivorId, createdFrom: new Date(scoresCreatedFrom) },
    ])
  })

  it("is safe to redeliver: a second pass issues the same bounded mutation", async () => {
    const fake = createFakeScoreAnalyticsRepository()

    await run({}, fake)
    await run({}, fake)

    // Both passes carry identical bounds, so the second matches nothing in
    // ClickHouse rather than moving anything twice.
    expect(fake.reassignments).toHaveLength(2)
    expect(fake.reassignments[0]).toEqual(fake.reassignments[1])
  })

  it("skips a merge that moved no scores", async () => {
    const { result, reassignments } = await run({ scoresMoved: 0, scoresCreatedFrom: null })

    expect(result).toEqual({ action: "skipped" })
    expect(reassignments).toEqual([])
  })
})
