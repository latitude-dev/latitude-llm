import { ACTIVE_RUNS_CACHE_KEY, ActiveRun } from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

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
  } catch (error) {
    return Result.error(error as Error)
  }
}
