import type { ApiKey } from '@latitude-data/core/browser'
import { buildRedisConnection } from '@latitude-data/core/redis'
import { env } from '@latitude-data/env'
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { createMiddleware } from 'hono/factory'
import { RateLimitError } from '@latitude-data/core/lib/errors'


declare module 'hono' {
    interface ContextVariableMap {
        apiKey: ApiKey
    }
}


const RATE_LIMIT_POINTS = 1000
const RATE_LIMIT_DURATION = 60

const rateLimiter = new RateLimiterRedis({
    storeClient: await buildRedisConnection({
        host: env.QUEUE_HOST,
        port: env.QUEUE_PORT,
        password: env.QUEUE_PASSWORD,
        enableOfflineQueue: true,
        maxRetriesPerRequest: null,
    }),
    points: RATE_LIMIT_POINTS,
    duration: RATE_LIMIT_DURATION,
});

const rateLimitMiddleware = () =>
    createMiddleware(async (c, next) => {
        const workspaceId: number = c.get('workspace').id

        try {
            await rateLimiter.consume(workspaceId.toString())
            await next()
        } catch (error) {
            if (error instanceof RateLimiterRes) {
                const res = error as RateLimiterRes
                throw new RateLimitError('Too many requests',
                    res.msBeforeNext / 1000,
                    RATE_LIMIT_POINTS,
                    res.remainingPoints,
                    new Date(Date.now() + res.msBeforeNext).getTime());
            }
            throw error
        }
    })


export default rateLimitMiddleware