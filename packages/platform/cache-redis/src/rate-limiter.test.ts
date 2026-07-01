import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import type { RedisClient } from "./client.ts"
import { checkRedisRateLimit } from "./rate-limiter.ts"

const failOpen = {
  allowed: true,
  count: Number.POSITIVE_INFINITY,
  retryAfterSeconds: null,
}

describe("checkRedisRateLimit", () => {
  it("fails open when the pipeline returns a missing ttl tuple", async () => {
    const redis = {
      pipeline: vi.fn(() => ({
        incr: vi.fn(),
        ttl: vi.fn(),
        exec: vi.fn(async () => [[null, 1]]),
      })),
      expire: vi.fn(),
    }

    const result = await Effect.runPromise(
      checkRedisRateLimit(redis as unknown as RedisClient, { key: "k", maxRequests: 10, windowSeconds: 60 }),
    )

    expect(result).toEqual(failOpen)
  })

  it("fails open when the pipeline returns an undefined ttl tuple", async () => {
    const redis = {
      pipeline: vi.fn(() => ({
        incr: vi.fn(),
        ttl: vi.fn(),
        exec: vi.fn(async () => [[null, 1], undefined]),
      })),
      expire: vi.fn(),
    }

    const result = await Effect.runPromise(
      checkRedisRateLimit(redis as unknown as RedisClient, { key: "k", maxRequests: 10, windowSeconds: 60 }),
    )

    expect(result).toEqual(failOpen)
  })

  it("allows requests under the limit when the pipeline succeeds", async () => {
    const redis = {
      pipeline: vi.fn(() => ({
        incr: vi.fn(),
        ttl: vi.fn(),
        exec: vi.fn(async () => [
          [null, 2],
          [null, 45],
        ]),
      })),
      expire: vi.fn(),
    }

    const result = await Effect.runPromise(
      checkRedisRateLimit(redis as unknown as RedisClient, { key: "k", maxRequests: 10, windowSeconds: 60 }),
    )

    expect(result).toEqual({ allowed: true, count: 2, retryAfterSeconds: 45 })
  })
})
