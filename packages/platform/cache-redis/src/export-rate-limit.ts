import { RateLimitError } from "@domain/shared"
import { Effect } from "effect"
import type { RedisClient } from "./client.ts"
import { waitForRedisClientReady } from "./client.ts"
import { checkRedisRateLimit } from "./rate-limiter.ts"

const EXPORT_RATE_LIMIT_REQUESTS = process.env.NODE_ENV === "production" ? 10 : 30
const EXPORT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60

interface EnforceExportRequestRateLimitInput {
  readonly redis: RedisClient
  readonly organizationId: string
  readonly projectId: string
  readonly recipientEmail: string
}

export async function enforceExportRequestRateLimit(input: EnforceExportRequestRateLimitInput): Promise<void> {
  await waitForRedisClientReady(input.redis)

  const result = await Effect.runPromise(
    checkRedisRateLimit(input.redis, {
      key: `org:${input.organizationId}:export:rate_limit:${input.projectId}:${input.recipientEmail}`,
      maxRequests: EXPORT_RATE_LIMIT_REQUESTS,
      windowSeconds: EXPORT_RATE_LIMIT_WINDOW_SECONDS,
    }),
  )

  if (!result.allowed) {
    throw new RateLimitError({
      message: `Export rate limit exceeded. You can request up to ${EXPORT_RATE_LIMIT_REQUESTS} exports per hour.`,
      retryAfterSeconds: result.retryAfterSeconds ?? EXPORT_RATE_LIMIT_WINDOW_SECONDS,
    })
  }
}
