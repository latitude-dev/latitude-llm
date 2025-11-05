import { RateLimiterRedis } from 'rate-limiter-flexible'
import { cache } from '@latitude-data/core/cache'

const RATE_LIMIT_DURATION = 1

const rateLimiters = new Map<number, RateLimiterRedis>()

export async function getRateLimiterForRateLimit(
  rateLimit: number,
): Promise<RateLimiterRedis> {
  const client = await cache()

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
