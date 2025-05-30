import { SubscriptionPlans } from '@latitude-data/core/browser'
import { unsafelyGetApiKeyByToken } from '@latitude-data/core/data-access'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import {
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from '@latitude-data/constants/errors'
import { createMiddleware } from 'hono/factory'
import { ReplyError } from 'ioredis'
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { getFromTokenCache, setToTokenCache } from './tokenCache'
import { getRateLimiterForRateLimit } from './rateLimiterCache'

async function getTokenRateLimit(token: string): Promise<{
  workspaceId: number
  rateLimit: number
  rateLimiter: RateLimiterRedis
}> {
  const cached = getFromTokenCache(token)
  if (cached) {
    return {
      workspaceId: cached.workspaceId,
      rateLimit: cached.rateLimit,
      rateLimiter: getRateLimiterForRateLimit(cached.rateLimit),
    }
  }

  const apiKeyResult = await unsafelyGetApiKeyByToken({ token })
  if (apiKeyResult.error || !apiKeyResult.value) {
    throw new NotFoundError('API key not found')
  }

  const apiKey = apiKeyResult.value
  const workspaceId = apiKey.workspaceId

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    throw new NotFoundError('Workspace not found')
  }

  const planConfig = SubscriptionPlans[workspace.currentSubscription.plan]
  // NOTE: Temporary
  const rateLimit = workspace.id === 13605 ? 60 : planConfig.rate_limit

  setToTokenCache(token, { workspaceId, rateLimit })

  return {
    workspaceId,
    rateLimit,
    rateLimiter: getRateLimiterForRateLimit(rateLimit),
  }
}

export const rateLimitMiddleware = () =>
  createMiddleware(async (c, next) => {
    const authorization = c.req.header('Authorization')
    const token = authorization?.split(' ')[1]
    if (!token) throw new UnauthorizedError('Authorization token required')

    const { workspaceId, rateLimit, rateLimiter } =
      await getTokenRateLimit(token)

    try {
      const rateLimitKey = `workspace:${workspaceId}`
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
