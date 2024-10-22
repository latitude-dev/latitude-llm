import { cache } from '@latitude-data/core/cache'
import { RateLimitError } from '@latitude-data/core/lib/errors'
import { createMiddleware } from 'hono/factory'
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'

const RATE_LIMIT_POINTS = 2000
const RATE_LIMIT_DURATION = 60

const rateLimiter = new RateLimiterRedis({
  storeClient: await cache(),
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
})

const rateLimitMiddleware = () =>
  createMiddleware(async (c, next) => {
    const handleRateLimitHeaders = (result: RateLimiterRes) => {
      c.header('Retry-After', (result.msBeforeNext / 1000).toString())
      c.header('X-RateLimit-Limit', RATE_LIMIT_POINTS.toString())
      c.header('X-RateLimit-Remaining', result.remainingPoints.toString())
      c.header(
        'X-RateLimit-Reset',
        (Date.now() + result.msBeforeNext).toString(),
      )
    }

    let token: string | undefined
    try {
      try {
        const authorization = c.req.header('Authorization')
        token = authorization?.split(' ')[1]
      } catch (error) {
        return await next()
      }

      const result = await rateLimiter.consume(token as string)
      handleRateLimitHeaders(result)
      await next()
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        const res = error as RateLimiterRes
        throw new RateLimitError(
          'Too many requests',
          res.msBeforeNext / 1000,
          RATE_LIMIT_POINTS,
          res.remainingPoints,
          Date.now() + res.msBeforeNext,
        )
      }
      throw error
    }
  })

export default rateLimitMiddleware
