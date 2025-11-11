import { ACTIVE_RUNS_CACHE_KEY, ActiveRun } from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { migrateActiveRunsCache } from './migrateCache'

export async function deleteActiveRun({
  workspaceId,
  projectId,
  runUuid,
  cache,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
  cache?: Cache
}): PromisedResult<ActiveRun, Error> {
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    // Don't migrate proactively - only migrate if we get WRONGTYPE error
    // Get the value of the hash field (O(1) operation)
    const jsonValue = await redisCache.hget(key, runUuid)
    const deletedRun = jsonValue
      ? (() => {
          const parsed = JSON.parse(jsonValue) as ActiveRun
          return {
            ...parsed,
            queuedAt: new Date(parsed.queuedAt),
            startedAt: parsed.startedAt
              ? new Date(parsed.startedAt)
              : undefined,
          } as ActiveRun
        })()
      : undefined

    // Use HDEL to atomically remove the run from the hash (O(1) operation)
    await redisCache.hdel(key, runUuid)

    if (deletedRun) {
      return Result.ok(deletedRun)
    }

    return Result.error(
      new NotFoundError(
        `Run not found with uuid ${runUuid} while deleting the run`,
      ),
    )
  } catch (error) {
    // Handle WRONGTYPE errors
    if (error instanceof Error && error.message.includes('WRONGTYPE')) {
      // Try to migrate and retry
      try {
        await migrateActiveRunsCache(workspaceId, projectId, redisCache)
        const jsonValue = await redisCache.hget(key, runUuid)
        const deletedRun = jsonValue
          ? (() => {
              const parsed = JSON.parse(jsonValue) as ActiveRun
              return {
                ...parsed,
                queuedAt: new Date(parsed.queuedAt),
                startedAt: parsed.startedAt
                  ? new Date(parsed.startedAt)
                  : undefined,
              } as ActiveRun
            })()
          : undefined

        await redisCache.hdel(key, runUuid)

        if (deletedRun) {
          return Result.ok(deletedRun)
        }

        return Result.error(
          new NotFoundError(
            `Run not found with uuid ${runUuid} while deleting the run`,
          ),
        )
      } catch (retryError) {
        return Result.error(
          new NotFoundError(
            `Run not found with uuid ${runUuid} while deleting the run`,
          ),
        )
      }
    }
    return Result.error(error as Error)
  }
}
