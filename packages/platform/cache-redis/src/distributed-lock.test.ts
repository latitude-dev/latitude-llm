import { DistributedLockRepository, DistributedLockUnavailableError } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { RedisClient } from "./client.ts"
import { RedisDistributedLockRepositoryLive } from "./distributed-lock.ts"

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
  effect: Effect.Effect<A, E, DistributedLockRepository>,
) => Effect.runPromise(effect.pipe(Effect.provide(RedisDistributedLockRepositoryLive(redis as unknown as RedisClient))))

describe("RedisDistributedLockRepositoryLive", () => {
  it("serializes work and releases with a token check", async () => {
    const redis = createFakeRedis()
    const key = "org:organization-id:locks:test"

    const result = await runWithLockRepository(
      redis,
      Effect.gen(function* () {
        const locks = yield* DistributedLockRepository
        return yield* locks.withLock({ key, ttlSeconds: 30 }, Effect.succeed("inside-critical-section"))
      }),
    )

    expect(result).toBe("inside-critical-section")
    expect(redis.setCalls[0]?.[0]).toBe(key)
    expect(redis.setCalls[0]?.[2]).toBe("EX")
    expect(redis.setCalls[0]?.[3]).toBe(30)
    expect(redis.setCalls[0]?.[4]).toBe("NX")
    expect(redis.evalCalls[0]?.key).toBe(key)
    expect(redis.values.size).toBe(0)
  })

  it("fails lock acquisition when another holder owns the key", async () => {
    const redis = createFakeRedis()
    const key = "org:organization-id:locks:test"
    redis.values.set(key, "other-token")

    await expect(
      runWithLockRepository(
        redis,
        Effect.gen(function* () {
          const locks = yield* DistributedLockRepository
          return yield* locks.withLock({ key, ttlSeconds: 30 }, Effect.succeed("never"))
        }),
      ),
    ).rejects.toBeInstanceOf(DistributedLockUnavailableError)
  })
})
