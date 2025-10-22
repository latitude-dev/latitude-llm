import { createMiddleware } from 'hono/factory'
import { RateLimitError } from '@latitude-data/constants/errors'
import { cloudWatchMetrics } from '../services/cloudwatchMetrics'

const MAX_INFLIGHT_REQUESTS = 1000

/**
 * Middleware that checks if the server has reached its maximum concurrent request capacity.
 * When inflight requests exceed MAX_INFLIGHT_REQUESTS (1000), it throws a RateLimitError
 * with a 30-second retry delay to prevent server overload.
 */
export const overCapacityMiddleware = () =>
  createMiddleware(async (_c, next) => {
    const currentInflight = cloudWatchMetrics.getInflightRequests()

    if (currentInflight >= MAX_INFLIGHT_REQUESTS) {
      throw new RateLimitError(
        'Server is at capacity. Too many concurrent requests.',
        30, // retry after 60 seconds (1 minute)
        MAX_INFLIGHT_REQUESTS,
        0, // no remaining requests available
        Date.now() + 60000, // reset in 1 minute
      )
    }

    await next()
  })
