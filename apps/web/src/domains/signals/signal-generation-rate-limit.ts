import { RateLimitError } from "@domain/shared"
import { type RedisClient, waitForRedisClientReady } from "@platform/cache-redis"

// A generation run costs up to 4 extended-reasoning model calls plus sandbox preview runs.
const GENERATION_RATE_LIMIT_REQUESTS = process.env.NODE_ENV === "production" ? 20 : 60
const GENERATION_RATE_LIMIT_WINDOW_SECONDS = 60 * 60

interface EnforceSignalGenerationRateLimitInput {
  readonly redis: RedisClient
  readonly organizationId: string
  readonly projectId: string
}

export async function enforceSignalGenerationRateLimit(input: EnforceSignalGenerationRateLimitInput): Promise<void> {
  await waitForRedisClientReady(input.redis)

  const key = `org:${input.organizationId}:signalGenerationRateLimit:${input.projectId}`

  const current = await input.redis.get(key)
  const count = current ? parseInt(current, 10) : 0

  if (count >= GENERATION_RATE_LIMIT_REQUESTS) {
    throw new RateLimitError({
      message: `Signal generation rate limit exceeded. You can generate up to ${GENERATION_RATE_LIMIT_REQUESTS} signals per hour.`,
      retryAfterSeconds: GENERATION_RATE_LIMIT_WINDOW_SECONDS,
    })
  }

  const pipeline = input.redis.pipeline()
  pipeline.incr(key)
  if (!current) {
    pipeline.expire(key, GENERATION_RATE_LIMIT_WINDOW_SECONDS)
  }
  await pipeline.exec()
}
