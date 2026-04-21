import { RateLimitError } from "@domain/shared"
import { type RedisClient, waitForRedisClientReady } from "@platform/cache-redis"

const EXPORT_RATE_LIMIT_REQUESTS = process.env.NODE_ENV === "production" ? 10 : 30
const EXPORT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60 // 1 hour

interface EnforceExportRequestRateLimitInput {
  readonly redis: RedisClient
  readonly organizationId: string
  readonly projectId: string
  readonly recipientEmail: string
}

export async function enforceExportRequestRateLimit(input: EnforceExportRequestRateLimitInput): Promise<void> {
  await waitForRedisClientReady(input.redis)

  const key = `export:rate_limit:${input.organizationId}:${input.projectId}:${input.recipientEmail}`

  const current = await input.redis.get(key)
  const count = current ? parseInt(current, 10) : 0

  if (count >= EXPORT_RATE_LIMIT_REQUESTS) {
    throw new RateLimitError({
      message: `Export rate limit exceeded. You can request up to ${EXPORT_RATE_LIMIT_REQUESTS} exports per hour.`,
      retryAfterSeconds: EXPORT_RATE_LIMIT_WINDOW_SECONDS,
    })
  }

  // Increment count and set expiry if new key
  const pipeline = input.redis.pipeline()
  pipeline.incr(key)
  if (!current) {
    pipeline.expire(key, EXPORT_RATE_LIMIT_WINDOW_SECONDS)
  }
  await pipeline.exec()
}
