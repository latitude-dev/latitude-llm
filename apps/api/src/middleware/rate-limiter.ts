import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import type { Context, Next } from "hono"

/**
 * Redis-backed rate limiter.
 *
 * Uses Redis INCR and EXPIRE for atomic counter operations.
 * Supports distributed deployments across multiple API instances.
 *
 * Two consumers today:
 * 1. {@link createAuthRateLimiter} — IP-keyed brute-force guard applied
 *    globally before the auth middleware runs.
 * 2. {@link createTierRateLimiter} — organization-keyed quota tier applied
 *    per route group (low / medium / high / critical), used to give cheap
 *    endpoints more headroom and expensive ones tighter limits.
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number
  /** Time window in seconds (default: 15 minutes = 900 seconds) */
  windowSeconds: number
  /** Function to extract the identifier from the request (IP, email, etc.) */
  keyGenerator: (c: Context) => string
  /** Optional: Custom error message */
  errorMessage?: string
  /** Redis key prefix for namespacing */
  keyPrefix: string
}

const getNumericPipelineValue = (result: [unknown, unknown]): number | null => {
  const value = result[1]
  return typeof value === "number" ? value : null
}

/**
 * Create a Redis-backed rate limiting middleware
 */
const createRedisRateLimiter = (config: RateLimitConfig) => {
  return async (c: Context, next: Next) => {
    const redis = c.get("redis")
    const key = `${config.keyPrefix}:${config.keyGenerator(c)}`

    try {
      // Use Redis multi to atomically increment and set expiry
      const pipeline = redis.pipeline()
      pipeline.incr(key)
      pipeline.ttl(key)

      const results = await pipeline.exec()

      if (!results) {
        // Redis error, allow request but log warning
        await next()
        return
      }

      const [incrResult, ttlResult] = results

      // Check for errors
      if (incrResult[0] || ttlResult[0]) {
        await next()
        return
      }

      const count = getNumericPipelineValue(incrResult)
      let ttl = getNumericPipelineValue(ttlResult)

      if (count === null || ttl === null) {
        await next()
        return
      }

      // Set expiry on first request
      if (count === 1 || ttl === -1) {
        await redis.expire(key, config.windowSeconds)
        ttl = config.windowSeconds
      }

      // Check if limit exceeded
      if (count > config.maxRequests) {
        const retryAfter = ttl
        return c.json(
          {
            error: config.errorMessage || "Too many requests",
            retryAfter,
          },
          429,
          { "Retry-After": String(retryAfter) },
        )
      }

      await next()
    } catch (_error) {
      // Redis error - fail open (allow request) to avoid blocking legitimate users
      await next()
    }
  }
}

/**
 * Rate limiter for authentication attempts by IP address
 * 10 attempts per 15 minutes in production, 100 attempts per 15 minutes in development
 * This protects against brute force attacks on API keys and JWT tokens
 */
export const createAuthRateLimiter = () => {
  // In development, be more permissive
  const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
  const isDevelopment = nodeEnv === "development"

  return createRedisRateLimiter({
    maxRequests: isDevelopment ? 100 : 10,
    windowSeconds: 15 * 60, // 15 minutes
    keyPrefix: "ratelimit:auth:ip",
    keyGenerator: (c: Context) => {
      const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown"
      return ip.split(",")[0].trim()
    },
    errorMessage: "Too many authentication attempts. Please try again later.",
  })
}

type RateLimitTier = "low" | "medium" | "high" | "critical"

const TIER_LIMITS: Record<RateLimitTier, { readonly maxRequests: number; readonly windowSeconds: number }> = {
  low: { maxRequests: 100, windowSeconds: 60 },
  medium: { maxRequests: 60, windowSeconds: 60 },
  high: { maxRequests: 15, windowSeconds: 60 },
  critical: { maxRequests: 3, windowSeconds: 60 },
}

/**
 * Per-route rate-limit tiers, keyed by the authenticated organization id.
 *
 * Tiers are sized so that one greedy tenant can't starve another's quota:
 * - `low` ............ 100 req / min — list/get reads, the cheap stuff
 * - `medium` (default) 60 req / min — most mutations and single-row writes
 * - `high` ............ 15 req / min — bulk reads with filter/search/semantic load
 * - `critical` ......... 3 req / min — bulk imports, exports, monitor-issue (workflow-kicking)
 *
 * Apply at the routing site, before the matching subrouter is mounted, e.g.
 * `routes.use("/projects/:projectSlug/traces", createTierRateLimiter("high"))`.
 *
 * The auth middleware must have already populated `c.var.organization` before
 * this runs, otherwise the limiter falls back to a single shared `unknown`
 * bucket — fine for unauthenticated requests because the auth middleware will
 * reject them anyway.
 *
 * @public Public API surface for the API expansion plan; consumed by route
 * mounts in subsequent PRs. Marked `@public` so knip doesn't flag it as
 * unused while it's waiting for its first consumer.
 */
export const createTierRateLimiter = (tier: RateLimitTier) => {
  const { maxRequests, windowSeconds } = TIER_LIMITS[tier]
  return createRedisRateLimiter({
    maxRequests,
    windowSeconds,
    keyPrefix: `ratelimit:tier:${tier}:org`,
    keyGenerator: (c: Context) => c.get("organization")?.id ?? "unknown",
    errorMessage: `Rate limit exceeded for ${tier}-tier endpoints. Please slow down.`,
  })
}
