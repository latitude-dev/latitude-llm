import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
  ActiveRun,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../../cache'
import { NotFoundError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'

/**
 * Updates an active run in the document-scoped Redis cache.
 * This is the new storage engine that stores runs per document for better performance.
 */
export async function updateActiveRunByDocument({
  workspaceId,
  projectId,
  documentUuid,
  runUuid,
  updates,
  cache,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  runUuid: string
  updates: Partial<Pick<ActiveRun, 'startedAt' | 'caption'>>
  cache?: Cache
}): PromisedResult<ActiveRun, Error> {
  const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
    workspaceId,
    projectId,
    documentUuid,
  )
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

    const existingRun = JSON.parse(jsonValue) as ActiveRun
    const updatedRun: ActiveRun = {
      ...existingRun,
      ...updates,
      queuedAt: new Date(existingRun.queuedAt),
      startedAt: updates.startedAt
        ? updates.startedAt
        : existingRun.startedAt
          ? new Date(existingRun.startedAt)
          : undefined,
    }

    const updatedJsonValue = JSON.stringify(updatedRun)

    await redisCache
      .multi()
      .hset(key, runUuid, updatedJsonValue)
      .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(updatedRun)
  } catch (error) {
    return Result.error(error as Error)
  }
}
