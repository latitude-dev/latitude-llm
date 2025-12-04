import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
  ActiveRun,
  LogSources,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../../cache'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'

/**
 * Creates an active run in the document-scoped Redis cache.
 * This is the new storage engine that stores runs per document for better performance.
 */
export async function createActiveRunByDocument({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
  queuedAt,
  source,
  cache,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
  queuedAt: Date
  source: LogSources
  cache?: Cache
}): PromisedResult<ActiveRun, Error> {
  const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
    workspaceId,
    projectId,
    documentUuid,
  )
  const redisCache = cache ?? (await redis())

  try {
    const activeRun: ActiveRun = {
      uuid: runUuid,
      queuedAt,
      source,
      documentUuid,
      commitUuid,
    }
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
