import { MiddlewareHandler } from 'hono'
import { cloudWatchMetrics } from '../services/cloudwatchMetrics'

/**
 * Middleware that tracks the number of currently processing requests (inflight requests).
 * Increments the inflight counter when a request starts and decrements it when the request
 * completes (successfully or with an error), used for capacity monitoring and rate limiting.
 */
export const inflightRequestsMiddleware = (): MiddlewareHandler => {
  return async (_c, next) => {
    cloudWatchMetrics.incrementInflightRequests()

    try {
      await next()
    } finally {
      cloudWatchMetrics.decrementInflightRequests()
    }
  }
}
