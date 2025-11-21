import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
  LogSources,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

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
    const activeRun: ActiveRun = { uuid: runUuid, queuedAt, source }
    const jsonValue = JSON.stringify(activeRun)

    await redisCache
      .multi()
      .hset(key, runUuid, jsonValue)
      .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(activeRun)
  } catch (error) {
    return Result.error(error as Error)
  }
}
