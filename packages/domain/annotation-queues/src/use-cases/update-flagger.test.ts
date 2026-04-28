import { CacheStore, FlaggerId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { FLAGGER_DEFAULT_SAMPLING } from "../constants.ts"
import type { Flagger } from "../entities/flagger.ts"
import { FLAGGER_DEFAULT_ENABLED } from "../entities/flagger.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { createFakeFlaggerRepository } from "../testing/fake-flagger-repository.ts"
import { updateFlaggerUseCase } from "./update-flagger.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))

const makeFlagger = (slug: string, enabled: boolean): Flagger => ({
  id: FlaggerId(`${slug.padEnd(24, "x").slice(0, 24)}`),
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  slug,
  enabled,
  sampling: FLAGGER_DEFAULT_SAMPLING,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const createCacheLayer = () => {
  const deletedKeys: string[] = []
  const layer = Layer.succeed(CacheStore, {
    get: () => Effect.succeed(null),
    set: () => Effect.void,
    delete: (key: string) => {
      deletedKeys.push(key)
      return Effect.void
    },
  })
  return { layer, deletedKeys }
}

describe("updateFlaggerUseCase", () => {
  it("toggles `enabled` and returns the updated flagger", async () => {
    const seed = makeFlagger("jailbreaking", FLAGGER_DEFAULT_ENABLED)
    const { repository } = createFakeFlaggerRepository([seed])
    const { layer: cacheLayer } = createCacheLayer()

    const layer = Layer.mergeAll(
      Layer.succeed(FlaggerRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      cacheLayer,
    )

    const updated = await Effect.runPromise(
      updateFlaggerUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "jailbreaking",
        enabled: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(updated?.enabled).toBe(false)
    expect(updated?.id).toBe(seed.id)
  })

  it("evicts the project's flagger cache so the next read picks up the new value before TTL", async () => {
    // Cache eviction is the load-bearing behavior here: without it, callers
    // of `getProjectFlaggersUseCase` would see the stale `enabled` value for
    // up to 5 minutes and `processFlaggersUseCase` would keep enqueueing
    // (or short-circuiting) against the old config.
    const { repository } = createFakeFlaggerRepository([makeFlagger("jailbreaking", true)])
    const { layer: cacheLayer, deletedKeys } = createCacheLayer()

    const layer = Layer.mergeAll(
      Layer.succeed(FlaggerRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      cacheLayer,
    )

    await Effect.runPromise(
      updateFlaggerUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "jailbreaking",
        enabled: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(deletedKeys).toEqual([`org:${ORG_ID}:flaggers:${PROJECT_ID}`])
  })

  it("returns null and still evicts the cache when the row does not exist", async () => {
    // Eviction runs unconditionally so a no-op update doesn't leave a stale
    // cache entry around if the caller meant to invalidate state.
    const { repository } = createFakeFlaggerRepository([])
    const { layer: cacheLayer, deletedKeys } = createCacheLayer()

    const layer = Layer.mergeAll(
      Layer.succeed(FlaggerRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      cacheLayer,
    )

    const updated = await Effect.runPromise(
      updateFlaggerUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "jailbreaking",
        enabled: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(updated).toBeNull()
    expect(deletedKeys).toEqual([`org:${ORG_ID}:flaggers:${PROJECT_ID}`])
  })

  it("succeeds even when no CacheStore is in the layer (eviction is best-effort)", async () => {
    const seed = makeFlagger("jailbreaking", true)
    const { repository } = createFakeFlaggerRepository([seed])

    const layer = Layer.mergeAll(
      Layer.succeed(FlaggerRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    )

    const updated = await Effect.runPromise(
      updateFlaggerUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "jailbreaking",
        enabled: false,
      }).pipe(Effect.provide(layer)),
    )

    expect(updated?.enabled).toBe(false)
  })
})
