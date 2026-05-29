import { SlackRefreshLockRepository, SlackRefreshLockUnavailableError } from "@domain/integrations"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { RedisClient } from "./client.ts"
import { RedisSlackRefreshLockRepositoryLive } from "./slack-refresh-lock.ts"

const organizationId = OrganizationId("o".repeat(24))
const expectedKey = `org:${organizationId}:slack:refresh`

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
  effect: Effect.Effect<A, E, SlackRefreshLockRepository>,
) =>
  Effect.runPromise(effect.pipe(Effect.provide(RedisSlackRefreshLockRepositoryLive(redis as unknown as RedisClient))))

describe("RedisSlackRefreshLockRepositoryLive", () => {
  it("runs the critical section with an org-prefixed key and releases via token check", async () => {
    const redis = createFakeRedis()

    const result = await runWithLockRepository(
      redis,
      Effect.gen(function* () {
        const locks = yield* SlackRefreshLockRepository
        return yield* locks.withRefreshLock({ organizationId, ttlSeconds: 60 }, Effect.succeed("refreshed"))
      }),
    )

    expect(result).toBe("refreshed")
    expect(redis.setCalls[0]?.[0]).toBe(expectedKey)
    expect(redis.setCalls[0]?.[2]).toBe("EX")
    expect(redis.setCalls[0]?.[3]).toBe(60)
    expect(redis.setCalls[0]?.[4]).toBe("NX")
    expect(redis.evalCalls[0]?.key).toBe(expectedKey)
    // Lock released — no residue.
    expect(redis.values.size).toBe(0)
  })

  it("fails with SlackRefreshLockUnavailableError when another holder owns the key", async () => {
    const redis = createFakeRedis()
    redis.values.set(expectedKey, "other-token")

    await expect(
      runWithLockRepository(
        redis,
        Effect.gen(function* () {
          const locks = yield* SlackRefreshLockRepository
          return yield* locks.withRefreshLock({ organizationId, ttlSeconds: 60 }, Effect.succeed("never"))
        }),
      ),
    ).rejects.toBeInstanceOf(SlackRefreshLockUnavailableError)
  })

  it("does not delete a key it does not own on release", async () => {
    const redis = createFakeRedis()
    redis.values.set(expectedKey, "someone-elses-token")

    await runWithLockRepository(
      redis,
      Effect.gen(function* () {
        const locks = yield* SlackRefreshLockRepository
        // Acquisition fails, so the inner effect never runs and the
        // foreign lock value is left intact.
        return yield* locks
          .withRefreshLock({ organizationId, ttlSeconds: 60 }, Effect.void)
          .pipe(Effect.catch(() => Effect.void))
      }),
    )

    expect(redis.values.get(expectedKey)).toBe("someone-elses-token")
  })
})
