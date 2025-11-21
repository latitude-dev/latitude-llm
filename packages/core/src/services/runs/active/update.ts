import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

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
    const jsonValue = await redisCache.hget(key, runUuid)
    if (!jsonValue) {
      return Result.error(
        new NotFoundError(
          `Run not found with uuid ${runUuid} while updating the run`,
        ),
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

    // This refreshes the TTL of the workspace/project key to 3 hours again
    await redisCache
      .multi()
      .hset(key, runUuid, JSON.stringify(updatedRun))
      .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(updatedRun)
  } catch (error) {
    return Result.error(error as Error)
  }
}
