import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { migrateActiveRunsCache } from './migrateCache'

export async function updateActiveRun({
  workspaceId,
  projectId,
  runUuid,
  startedAt,
  caption,
  cache,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
  startedAt?: Date
  caption?: string
  cache?: Cache
}): PromisedResult<ActiveRun, Error> {
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    // Don't migrate proactively - only migrate if we get WRONGTYPE error
    // Get the value of the hash field (O(1) operation)
    const jsonValue = await redisCache.hget(key, runUuid)
    if (!jsonValue) {
      return Result.error(
        new NotFoundError(`Run not found with uuid ${runUuid}`),
      )
    }

    const existingRun = JSON.parse(jsonValue)
    const updatedRun: ActiveRun = {
      ...existingRun,
      queuedAt: new Date(existingRun.queuedAt),
      startedAt:
        startedAt ??
        (existingRun.startedAt ? new Date(existingRun.startedAt) : undefined),
      caption: caption ?? existingRun.caption,
    }

    // Use HSET to atomically update the run in the hash, refreshing the TTL of the workspace/project key to 3 hours
    await redisCache
      .multi()
      .hset(key, runUuid, JSON.stringify(updatedRun))
      .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(updatedRun)
  } catch (error) {
    // Handle WRONGTYPE errors
    if (error instanceof Error && error.message.includes('WRONGTYPE')) {
      // Try to migrate and retry
      try {
        await migrateActiveRunsCache(workspaceId, projectId, redisCache)
        const jsonValue = await redisCache.hget(key, runUuid)
        if (!jsonValue) {
          return Result.error(
            new NotFoundError(`Run not found with uuid ${runUuid}`),
          )
        }

        const existingRun = JSON.parse(jsonValue)
        const updatedRun: ActiveRun = {
          ...existingRun,
          queuedAt: new Date(existingRun.queuedAt),
          startedAt:
            startedAt ??
            (existingRun.startedAt
              ? new Date(existingRun.startedAt)
              : undefined),
          caption: caption ?? existingRun.caption,
        }

        await redisCache
          .multi()
          .hset(key, runUuid, JSON.stringify(updatedRun))
          .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
          .exec()

        return Result.ok(updatedRun)
      } catch (retryError) {
        return Result.error(error as Error)
      }
    }
    return Result.error(error as Error)
  }
}
