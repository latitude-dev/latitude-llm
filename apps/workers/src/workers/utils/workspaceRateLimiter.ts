import { cache } from '@latitude-data/core/cache'
import { captureMessage } from './captureException'

/**
 * Workspace-level rate limiter to prevent a single workspace from overwhelming the system.
 * Uses a sliding window algorithm with Redis to track and limit concurrent jobs per workspace.
 */

const WORKSPACE_RATE_LIMIT = Number(process.env.WORKSPACE_RATE_LIMIT) || 100 // Max concurrent jobs per workspace
const WORKSPACE_RATE_WINDOW_MS = Number(process.env.WORKSPACE_RATE_WINDOW_MS) || 60_000 // 1 minute window
const RATE_LIMIT_KEY_PREFIX = 'rate:workspace:'

type RateLimitResult = {
  allowed: boolean
  current: number
  limit: number
  retryAfterMs?: number
}

/**
 * Checks if a workspace can process more jobs.
 * Uses a sliding window counter in Redis.
 */
export async function checkWorkspaceRateLimit(
  workspaceId: number,
): Promise<RateLimitResult> {
  const redis = await cache()
  const key = `${RATE_LIMIT_KEY_PREFIX}${workspaceId}`
  const now = Date.now()
  const windowStart = now - WORKSPACE_RATE_WINDOW_MS

  try {
    // Remove expired entries and count current entries in one transaction
    const pipeline = redis.pipeline()
    pipeline.zremrangebyscore(key, '-inf', windowStart)
    pipeline.zcard(key)
    const results = await pipeline.exec()

    const current = (results?.[1]?.[1] as number) || 0

    if (current >= WORKSPACE_RATE_LIMIT) {
      // Get the oldest entry to calculate retry time
      const oldestEntries = await redis.zrange(key, 0, 0, 'WITHSCORES')
      const oldestTimestamp = oldestEntries?.[1]
        ? parseInt(oldestEntries[1], 10)
        : now

      const retryAfterMs = Math.max(
        0,
        WORKSPACE_RATE_WINDOW_MS - (now - oldestTimestamp),
      )

      return {
        allowed: false,
        current,
        limit: WORKSPACE_RATE_LIMIT,
        retryAfterMs,
      }
    }

    return {
      allowed: true,
      current,
      limit: WORKSPACE_RATE_LIMIT,
    }
  } catch (error) {
    // On error, allow the request to proceed (fail open)
    return {
      allowed: true,
      current: 0,
      limit: WORKSPACE_RATE_LIMIT,
    }
  }
}

/**
 * Records a job start for rate limiting.
 */
export async function recordJobStart(
  workspaceId: number,
  jobId: string,
): Promise<void> {
  const redis = await cache()
  const key = `${RATE_LIMIT_KEY_PREFIX}${workspaceId}`
  const now = Date.now()

  try {
    await redis.zadd(key, now, `${jobId}:${now}`)
    // Set TTL on the key to auto-expire old data
    await redis.expire(key, Math.ceil(WORKSPACE_RATE_WINDOW_MS / 1000) + 60)
  } catch {
    // Ignore errors - rate limiting is best effort
  }
}

/**
 * Records a job completion for rate limiting.
 */
export async function recordJobComplete(
  workspaceId: number,
  jobId: string,
): Promise<void> {
  const redis = await cache()
  const key = `${RATE_LIMIT_KEY_PREFIX}${workspaceId}`

  try {
    // Remove entries matching this job ID (pattern: jobId:*)
    const entries = await redis.zrange(key, 0, -1)
    const toRemove = entries.filter((e) => e.startsWith(`${jobId}:`))
    if (toRemove.length > 0) {
      await redis.zrem(key, ...toRemove)
    }
  } catch {
    // Ignore errors - rate limiting is best effort
  }
}

/**
 * Gets current rate limit stats for a workspace.
 */
export async function getWorkspaceRateLimitStats(
  workspaceId: number,
): Promise<{ current: number; limit: number; utilizationPercent: number }> {
  const result = await checkWorkspaceRateLimit(workspaceId)
  return {
    current: result.current,
    limit: result.limit,
    utilizationPercent: (result.current / result.limit) * 100,
  }
}

/**
 * Checks rate limit and logs a warning if limit is exceeded.
 * Returns true if the job should be delayed.
 */
export async function shouldDelayForRateLimit(
  workspaceId: number,
  jobId: string,
): Promise<{ shouldDelay: boolean; delayMs: number }> {
  const result = await checkWorkspaceRateLimit(workspaceId)

  if (!result.allowed) {
    captureMessage(
      `Workspace ${workspaceId} rate limit exceeded`,
      'warning',
      {
        workspaceId,
        jobId,
        current: result.current,
        limit: result.limit,
        retryAfterMs: result.retryAfterMs,
      },
    )

    return {
      shouldDelay: true,
      delayMs: result.retryAfterMs || 5000, // Default 5 second delay
    }
  }

  return { shouldDelay: false, delayMs: 0 }
}

/**
 * Gets all workspaces that are currently at or near their rate limit.
 * Useful for monitoring dashboards.
 */
export async function getHotWorkspaces(
  threshold = 0.8,
): Promise<{ workspaceId: string; utilization: number }[]> {
  const redis = await cache()
  const hotWorkspaces: { workspaceId: string; utilization: number }[] = []

  try {
    // Scan for all rate limit keys
    let cursor = '0'
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${RATE_LIMIT_KEY_PREFIX}*`,
        'COUNT',
        100,
      )
      cursor = nextCursor

      for (const key of keys) {
        const workspaceId = key.replace(RATE_LIMIT_KEY_PREFIX, '')
        const count = await redis.zcard(key)
        const utilization = count / WORKSPACE_RATE_LIMIT

        if (utilization >= threshold) {
          hotWorkspaces.push({ workspaceId, utilization })
        }
      }
    } while (cursor !== '0')
  } catch {
    // Ignore errors
  }

  return hotWorkspaces.sort((a, b) => b.utilization - a.utilization)
}
