import { Effect } from "effect"
import type { RedisClient } from "./client.ts"

export interface RateLimitCheckInput {
  /** Fully-qualified Redis key (caller is responsible for namespacing). */
  readonly key: string
  /** Maximum permitted requests within the window. */
  readonly maxRequests: number
  /** Window length in seconds. */
  readonly windowSeconds: number
}

export interface RateLimitCheckResult {
  /** True when the request is under the limit and the counter was incremented. */
  readonly allowed: boolean
  /** Current counter value after this increment (or Infinity on Redis error / fail-open). */
  readonly count: number
  /** Seconds remaining until the window resets. Null when unknown (fail-open). */
  readonly retryAfterSeconds: number | null
}

const getNumericPipelineValue = (result: [unknown, unknown]): number | null => {
  const value = result[1]
  return typeof value === "number" ? value : null
}

/**
 * Atomic Redis-backed fixed-window rate limiter. INCRs the key, reads the TTL
 * in the same pipeline, and expires the key on first hit. Returns `allowed`
 * based on whether the post-increment counter is within `maxRequests`.
 *
 * Fails open on any Redis error — the caller should treat `allowed=true`
 * from a fail-open path as acceptable (we'd rather over-enqueue a workflow
 * than drop it silently due to a cache outage).
 */
export const checkRedisRateLimit = (
  redis: RedisClient,
  input: RateLimitCheckInput,
): Effect.Effect<RateLimitCheckResult> =>
  Effect.tryPromise({
    try: async () => {
      const pipeline = redis.pipeline()
      pipeline.incr(input.key)
      pipeline.ttl(input.key)
      const results = await pipeline.exec()

      if (!results) {
        return { allowed: true, count: Number.POSITIVE_INFINITY, retryAfterSeconds: null }
      }

      const [incrResult, ttlResult] = results
      if (incrResult[0] || ttlResult[0]) {
        return { allowed: true, count: Number.POSITIVE_INFINITY, retryAfterSeconds: null }
      }

      const count = getNumericPipelineValue(incrResult)
      let ttl = getNumericPipelineValue(ttlResult)

      if (count === null || ttl === null) {
        return { allowed: true, count: Number.POSITIVE_INFINITY, retryAfterSeconds: null }
      }

      if (count === 1 || ttl === -1) {
        await redis.expire(input.key, input.windowSeconds)
        ttl = input.windowSeconds
      }

      return {
        allowed: count <= input.maxRequests,
        count,
        retryAfterSeconds: ttl,
      }
    },
    catch: (error) => error,
  }).pipe(
    Effect.catch(() =>
      Effect.succeed({
        allowed: true,
        count: Number.POSITIVE_INFINITY,
        retryAfterSeconds: null,
      } satisfies RateLimitCheckResult),
    ),
  )
