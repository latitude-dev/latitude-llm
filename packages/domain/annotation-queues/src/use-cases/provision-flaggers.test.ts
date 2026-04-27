import { OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { FLAGGER_DEFAULT_SAMPLING } from "../constants.ts"
import { FLAGGER_DEFAULT_ENABLED } from "../entities/flagger.ts"
import { listQueueStrategySlugs } from "../flagger-strategies/index.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { createFakeFlaggerRepository } from "../testing/fake-flagger-repository.ts"
import { provisionFlaggersUseCase } from "./provision-flaggers.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))

const createTestLayer = () => {
  const { repository, flaggers } = createFakeFlaggerRepository()
  return {
    flaggers,
    layer: Layer.succeed(FlaggerRepository, repository),
  }
}

describe("provisionFlaggersUseCase", () => {
  it("provisions one row per registered strategy slug with default enabled and sampling", async () => {
    const { layer, flaggers } = createTestLayer()

    const result = await Effect.runPromise(
      provisionFlaggersUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
      }).pipe(Effect.provide(layer)),
    )

    const expectedSlugs = listQueueStrategySlugs()
    expect(result).toHaveLength(expectedSlugs.length)

    const provisionedSlugs = result.map((f) => f.slug).sort()
    expect(provisionedSlugs).toEqual([...expectedSlugs].sort())

    for (const flagger of result) {
      expect(flagger.enabled).toBe(FLAGGER_DEFAULT_ENABLED)
      expect(flagger.sampling).toBe(FLAGGER_DEFAULT_SAMPLING)
      expect(flagger.organizationId).toBe(ORG_ID)
      expect(flagger.projectId).toBe(PROJECT_ID)
    }

    expect(flaggers.size).toBe(expectedSlugs.length)
  })

  it("is idempotent — running twice yields the same set of rows", async () => {
    const { layer } = createTestLayer()

    const first = await Effect.runPromise(
      provisionFlaggersUseCase({ organizationId: ORG_ID, projectId: PROJECT_ID }).pipe(Effect.provide(layer)),
    )
    const second = await Effect.runPromise(
      provisionFlaggersUseCase({ organizationId: ORG_ID, projectId: PROJECT_ID }).pipe(Effect.provide(layer)),
    )

    expect(second).toHaveLength(first.length)
    const firstIds = new Set(first.map((f) => f.id))
    for (const row of second) {
      expect(firstIds.has(row.id)).toBe(true)
    }
  })
})
