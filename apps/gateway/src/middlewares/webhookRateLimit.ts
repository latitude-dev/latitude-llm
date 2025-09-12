import { createMiddleware } from 'hono/factory'
import { RateLimiterRes } from 'rate-limiter-flexible'
import { ReplyError } from 'ioredis'
import { RateLimitError } from '@latitude-data/constants/errors'
import { getRateLimiterForRateLimit } from './rateLimit/rateLimiterCache'

/**
 * Rate limit middleware specifically for public webhook endpoints that don't require authorization
 */
export const webhookRateLimitMiddleware = (rateLimit: number = 10) =>
  createMiddleware(async (c, next) => {
    const rateLimiter = await getRateLimiterForRateLimit(rateLimit)

    // Use IP address as the rate limit key for public endpoints
    const ip =
      c.req.header('x-forwarded-for') ||
      c.req.header('x-real-ip') ||
      ('socket' in c.req.raw
        ? ((c.req.raw.socket as any).remoteAddress as string)
        : '0.0.0.0')

    if (!ip) return await next()

    try {
      const rateLimitKey = `webhook:ip:${ip}`
      const result = await rateLimiter.consume(rateLimitKey, 1)

      c.header('Retry-After', (result.msBeforeNext / 1000).toString())
      c.header('X-RateLimit-Limit', rateLimit.toString())
      c.header('X-RateLimit-Remaining', result.remainingPoints.toString())
      c.header(
        'X-RateLimit-Reset',
        (Date.now() + result.msBeforeNext).toString(),
      )

      await next()
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        const res = error as RateLimiterRes

        throw new RateLimitError(
          'Too many requests',
          res.msBeforeNext / 1000,
          rateLimit,
          res.remainingPoints,
          Date.now() + res.msBeforeNext,
        )
      }

      if (error instanceof ReplyError) {
        return await next()
      }

      throw error
    }
  })
