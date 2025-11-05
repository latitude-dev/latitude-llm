import { Context, MiddlewareHandler, Next } from 'hono'
import { getTokenCacheSize } from './rateLimit/tokenCache'
import { getRateLimiterCacheSize } from './rateLimit/rateLimiterCache'

/**
 * Memory tracking middleware with buffering to avoid excessive logging
 * @param bufferIntervalMs Time in ms between memory usage logs (default: 60000ms = 1 minute)
 * @returns Hono middleware handler
 */
export const memoryUsageMiddleware = (
  bufferIntervalMs = 60000,
): MiddlewareHandler => {
  let lastLogTime = 0

  return async (_: Context, next: Next) => {
    const currentTime = Date.now()

    // Only log if the buffer interval has passed
    if (currentTime - lastLogTime > bufferIntervalMs) {
      const memoryUsage = process.memoryUsage()

      console.log({
        memoryUsage: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`, // Resident Set Size
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`, // Total heap size
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`, // Heap actually used
          external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`, // External memory
        },
        cacheSizes: {
          tokenCache: getTokenCacheSize(),
          rateLimiterCache: getRateLimiterCacheSize(),
        },
        timestamp: new Date().toISOString(),
      })

      lastLogTime = currentTime
    }

    await next()
  }
}
