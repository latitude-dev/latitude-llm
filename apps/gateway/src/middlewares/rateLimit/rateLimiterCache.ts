import { RateLimiterRedis } from 'rate-limiter-flexible'
import { cache } from '@latitude-data/core/cache'

const RATE_LIMIT_DURATION = 1

const client = await cache()

const rateLimiters = new Map<number, RateLimiterRedis>()

export function getRateLimiterForRateLimit(
  rateLimit: number,
): RateLimiterRedis {
  if (rateLimiters.has(rateLimit)) {
    return rateLimiters.get(rateLimit)!
  }

  const rateLimiter = new RateLimiterRedis({
    storeClient: client,
    points: rateLimit,
    duration: RATE_LIMIT_DURATION,
  })

  rateLimiters.set(rateLimit, rateLimiter)
  return rateLimiter
}
