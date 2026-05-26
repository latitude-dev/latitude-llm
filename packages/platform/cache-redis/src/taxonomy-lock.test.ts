import { OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import {
  TaxonomyClusterLockUnavailableError,
  TaxonomyGardenLockUnavailableError,
  TaxonomyLockRepository,
} from "@domain/taxonomy"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { RedisClient } from "./client.ts"
import { RedisTaxonomyLockRepositoryLive } from "./taxonomy-lock.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const clusterId = TaxonomyClusterId("c".repeat(24))

type SetCall = readonly [key: string, token: string, ex: "EX", ttlSeconds: number, nx: "NX"]

const createFakeRedis = () => {
  const values = new Map<string, string>()
  const setCalls: SetCall[] = []
  const evalCalls: Array<{ readonly key: string; readonly token: string }> = []

  const redis = {
    async set(key: string, token: string, ex: "EX", ttlSeconds: number, nx: "NX") {
      setCalls.push([key, token, ex, ttlSeconds, nx])
      if (values.has(key)) return null
      values.set(key, token)
      return "OK"
    },
    async eval(_script: string, _keyCount: number, key: string, token: string) {
      evalCalls.push({ key, token })
      if (values.get(key) !== token) return 0
      values.delete(key)
      return 1
    },
    values,
    setCalls,
    evalCalls,
  }

  return redis
}

const runWithLockRepository = <A, E>(
  redis: ReturnType<typeof createFakeRedis>,
  effect: Effect.Effect<A, E, TaxonomyLockRepository>,
) => Effect.runPromise(effect.pipe(Effect.provide(RedisTaxonomyLockRepositoryLive(redis as unknown as RedisClient))))

describe("RedisTaxonomyLockRepositoryLive", () => {
  it("serializes cluster work with org-prefixed keys and releases with a token check", async () => {
    const redis = createFakeRedis()

    const result = await runWithLockRepository(
      redis,
      Effect.gen(function* () {
        const locks = yield* TaxonomyLockRepository
        return yield* locks.withClusterLock(
          { organizationId, clusterId, ttlSeconds: 30 },
          Effect.succeed("inside-critical-section"),
        )
      }),
    )

    expect(result).toBe("inside-critical-section")
    expect(redis.setCalls[0]?.[0]).toBe(`org:${organizationId}:taxonomy:cluster:${clusterId}`)
    expect(redis.setCalls[0]?.[2]).toBe("EX")
    expect(redis.setCalls[0]?.[3]).toBe(30)
    expect(redis.setCalls[0]?.[4]).toBe("NX")
    expect(redis.evalCalls[0]?.key).toBe(`org:${organizationId}:taxonomy:cluster:${clusterId}`)
    expect(redis.values.size).toBe(0)
  })

  it("fails cluster lock acquisition when another holder owns the key", async () => {
    const redis = createFakeRedis()
    redis.values.set(`org:${organizationId}:taxonomy:cluster:${clusterId}`, "other-token")

    await expect(
      runWithLockRepository(
        redis,
        Effect.gen(function* () {
          const locks = yield* TaxonomyLockRepository
          return yield* locks.withClusterLock({ organizationId, clusterId, ttlSeconds: 30 }, Effect.succeed("never"))
        }),
      ),
    ).rejects.toBeInstanceOf(TaxonomyClusterLockUnavailableError)
  })

  it("uses separate project-scoped garden locks", async () => {
    const redis = createFakeRedis()

    await runWithLockRepository(
      redis,
      Effect.gen(function* () {
        const locks = yield* TaxonomyLockRepository
        return yield* locks.withGardenLock({ organizationId, projectId, ttlSeconds: 60 }, Effect.void)
      }),
    )

    expect(redis.setCalls[0]?.[0]).toBe(`org:${organizationId}:taxonomy:garden:${projectId}`)
  })

  it("fails garden lock acquisition when another holder owns the key", async () => {
    const redis = createFakeRedis()
    redis.values.set(`org:${organizationId}:taxonomy:garden:${projectId}`, "other-token")

    await expect(
      runWithLockRepository(
        redis,
        Effect.gen(function* () {
          const locks = yield* TaxonomyLockRepository
          return yield* locks.withGardenLock({ organizationId, projectId, ttlSeconds: 60 }, Effect.void)
        }),
      ),
    ).rejects.toBeInstanceOf(TaxonomyGardenLockUnavailableError)
  })
})
