import { ACTIVE_RUNS_CACHE_KEY, ActiveRun } from '@latitude-data/constants'
import { cache as redis } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function deleteActiveRun({
  workspaceId,
  projectId,
  runUuid,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
}): PromisedResult<ActiveRun, Error> {
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const cache = await redis()

  try {
    // Get the value of the hash field (O(1) operation)
    const jsonValue = await cache.hget(key, runUuid)
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
    await cache.hdel(key, runUuid)

    if (deletedRun) {
      return Result.ok(deletedRun)
    }

    return Result.error(new NotFoundError(`Run not found with uuid ${runUuid}`))
  } catch (error) {
    return Result.error(error as Error)
  }
}
