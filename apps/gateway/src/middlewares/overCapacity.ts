import { createMiddleware } from 'hono/factory'
import { RateLimitError } from '@latitude-data/constants/errors'
import { cloudWatchMetrics } from '../services/cloudwatchMetrics'

const MAX_INFLIGHT_REQUESTS = 30

export const overCapacityMiddleware = () =>
  createMiddleware(async (_c, next) => {
    const currentInflight = cloudWatchMetrics.getInflightRequests()

    if (currentInflight >= MAX_INFLIGHT_REQUESTS) {
      throw new RateLimitError(
        'Server is at capacity. Too many concurrent requests.',
        1, // retry after 1 second
        MAX_INFLIGHT_REQUESTS,
        0, // no remaining requests available
        Date.now() + 1000, // reset in 1 second
      )
    }

    await next()
  })
