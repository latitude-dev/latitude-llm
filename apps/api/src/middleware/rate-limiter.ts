import type { Context, Next } from "hono"

/**
 * Redis-backed rate limiter.
 *
 * Uses Redis INCR and EXPIRE for atomic counter operations.
 * Supports distributed deployments across multiple API instances.
 *
 * Used by {@link createTierRateLimiter} as an organization-keyed quota tier
 * applied per route group (low / medium / high / ultra / max), giving cheap
 * endpoints more headroom and expensive ones tighter limits.
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

type RateLimitTier = "low" | "medium" | "high" | "ultra" | "max"

const TIER_LIMITS: Record<RateLimitTier, { readonly maxRequests: number; readonly windowSeconds: number }> = {
  low: { maxRequests: 1_000, windowSeconds: 60 },
  medium: { maxRequests: 600, windowSeconds: 60 },
  high: { maxRequests: 150, windowSeconds: 60 },
  ultra: { maxRequests: 30, windowSeconds: 60 },
  max: { maxRequests: 10, windowSeconds: 60 },
}

// Bucket key: org id when authenticated, else client IP (first `X-Forwarded-For` hop), else `unknown`.
// Org routes still yield the pre-existing `org:<id>` key, so existing keyspaces are unchanged.
const rateLimitScope = (c: Context): string => {
  const organizationId = c.get("organization")?.id
  if (organizationId) return `org:${organizationId}`

  const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  if (clientIp) return `ip:${clientIp}`

  return "unknown"
}

/**
 * Per-route rate-limit tiers, keyed by organization → client IP → `unknown`.
 *
 * Tiers are sized so that one greedy tenant can't starve another's quota:
 * - `low` ........... 1,000 req / min — list/get reads, the cheap stuff
 * - `medium` (default) 600 req / min — most mutations and single-row writes
 * - `high` ............ 150 req / min — bulk reads with filter/search/semantic load
 * - `ultra` ............ 30 req / min — bulk imports, exports, monitor-signal (workflow-kicking)
 * - `max` .............. 10 req / min — the unauthenticated bootstrap surface (IP-keyed)
 *
 * Apply at the routing site, before the matching subrouter is mounted, e.g.
 * `routes.use("/projects/:projectSlug/traces", createTierRateLimiter("high"))`.
 *
 * Authenticated routes are keyed by `c.var.organization`; the unauthenticated
 * `max` tier keys by client IP because no org context exists there.
 */
export const createTierRateLimiter = (tier: RateLimitTier) => {
  const { maxRequests, windowSeconds } = TIER_LIMITS[tier]
  return createRedisRateLimiter({
    maxRequests,
    windowSeconds,
    keyPrefix: `ratelimit:tier:${tier}`,
    keyGenerator: rateLimitScope,
    errorMessage: `Rate limit exceeded for ${tier}-tier endpoints. Please slow down.`,
  })
}

/**
 * Global (tenant-agnostic) rate limiter: one shared counter across every
 * caller, keyed only by `key`. It bounds the *total* request rate instead of
 * partitioning per org/IP like {@link createTierRateLimiter} — use it to shield
 * an unauthenticated surface from bulk abuse when there's no per-caller
 * identity or CAPTCHA to key on (e.g. account bootstrap). Stack it after a
 * per-IP tier so a single greedy IP is rejected before it burns global budget.
 */
export const createGlobalRateLimiter = ({
  key,
  maxRequests,
  windowSeconds,
}: {
  key: string
  maxRequests: number
  windowSeconds: number
}) =>
  createRedisRateLimiter({
    maxRequests,
    windowSeconds,
    keyPrefix: `ratelimit:global:${key}`,
    keyGenerator: () => "all",
    errorMessage: "Too many requests to this endpoint right now. Please retry shortly.",
  })
