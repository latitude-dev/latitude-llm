import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
  LogSources,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { migrateActiveRunsCache } from './migrateCache'

export async function createActiveRun({
  workspaceId,
  projectId,
  runUuid,
  queuedAt,
  source,
  cache,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
  queuedAt: Date
  source: LogSources
  cache?: Cache
}): PromisedResult<ActiveRun, Error> {
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    // Don't migrate proactively - only migrate if we get WRONGTYPE error
    const activeRun: ActiveRun = { uuid: runUuid, queuedAt, source }
    const jsonValue = JSON.stringify(activeRun)

    // Use HSET to atomically add the run to the hash, refreshing the TTL of the key to 3 hours
    await redisCache
      .multi()
      .hset(key, runUuid, jsonValue)
      .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(activeRun)
  } catch (error) {
    // Handle WRONGTYPE errors
    if (error instanceof Error && error.message.includes('WRONGTYPE')) {
      // Try to migrate and retry
      try {
        await migrateActiveRunsCache(workspaceId, projectId, redisCache)
        const activeRun: ActiveRun = { uuid: runUuid, queuedAt, source }
        const jsonValue = JSON.stringify(activeRun)

        await redisCache
          .multi()
          .hset(key, runUuid, jsonValue)
          .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
          .exec()

        return Result.ok(activeRun)
      } catch (retryError) {
        return Result.error(error as Error)
      }
    }
    return Result.error(error as Error)
  }
}
