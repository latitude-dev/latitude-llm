import {
  ACTIVE_RUN_CACHE_TTL,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function listCachedRuns(
  workspaceId: number,
  projectId: number,
  cache?: Cache,
): PromisedResult<ActiveRun[], Error> {
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    // Use HGETALL to get all runs from a workspace/project hash at once (O(N) but entire hash expires in 3 hours, so N won't be too large)
    const hashData = await redisCache.hgetall(key)

    if (!hashData || Object.keys(hashData).length === 0) {
      return Result.ok<ActiveRun[]>([])
    }

    // Parse each hash value (JSON string) to an ActiveRun object
    const activeRuns: ActiveRun[] = []
    const now = Date.now()

    for (const jsonValue of Object.values(hashData)) {
      try {
        const run = JSON.parse(jsonValue) as ActiveRun
        const queuedAt = new Date(run.queuedAt)

        // Filter expired runs (the entire hash expires in 3 hours, but it updates back to its initial TTL on every update to the hash, so we need to check each run individually of the hash to check if they're still valid)
        if (queuedAt.getTime() > now - ACTIVE_RUN_CACHE_TTL) {
          activeRuns.push({
            ...run,
            queuedAt,
            startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
          })
        }
      } catch (parseError) {
        // Skip invalid entries
        continue
      }
    }

    return Result.ok<ActiveRun[]>(activeRuns)
  } catch (error) {
    return Result.error(error as Error)
  }
}
