import { MiddlewareHandler } from 'hono'
import { cloudWatchMetrics } from '../services/cloudwatchMetrics'

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
