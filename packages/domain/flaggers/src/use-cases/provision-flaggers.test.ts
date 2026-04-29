import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { FLAGGER_DEFAULT_SAMPLING } from "../constants.ts"
import { FLAGGER_DEFAULT_ENABLED } from "../entities/flagger.ts"
import { listFlaggerStrategySlugs } from "../flagger-strategies/index.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { createFakeFlaggerRepository } from "../testing/fake-flagger-repository.ts"
import { provisionFlaggersUseCase } from "./provision-flaggers.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))

const createTestLayer = () => {
  const { repository, flaggers } = createFakeFlaggerRepository()
  return {
    flaggers,
    layer: Layer.mergeAll(
      Layer.succeed(FlaggerRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    ),
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

    const expectedSlugs = listFlaggerStrategySlugs()
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

  it("is idempotent — a second run inserts nothing and returns no rows", async () => {
    const { layer, flaggers } = createTestLayer()

    const first = await Effect.runPromise(
      provisionFlaggersUseCase({ organizationId: ORG_ID, projectId: PROJECT_ID }).pipe(Effect.provide(layer)),
    )
    const sizeAfterFirst = flaggers.size
    const second = await Effect.runPromise(
      provisionFlaggersUseCase({ organizationId: ORG_ID, projectId: PROJECT_ID }).pipe(Effect.provide(layer)),
    )

    expect(first).toHaveLength(listFlaggerStrategySlugs().length)
    expect(second).toHaveLength(0)
    expect(flaggers.size).toBe(sizeAfterFirst)
  })
})
