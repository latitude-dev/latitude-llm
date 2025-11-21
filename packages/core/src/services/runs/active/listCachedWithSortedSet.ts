import {
  ACTIVE_RUN_CACHE_TTL,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { Result } from '../../../lib/Result'

/**
 * ALTERNATIVE APPROACH: Using Redis Sorted Sets for better performance
 * 
 * This is a more efficient data structure for active runs because:
 * 1. Sorted by timestamp automatically (queuedAt or startedAt)
 * 2. Native pagination with ZRANGE
 * 3. Efficient cleanup with ZREMRANGEBYSCORE
 * 4. O(log(N)) insertion and deletion
 * 5. No need to load all runs to get a page
 * 
 * To migrate to this approach:
 * 1. Change storage in create.ts to use ZADD instead of HSET
 * 2. Change deletion in delete.ts to use ZREM instead of HDEL
 * 3. Use ZREMRANGEBYSCORE to auto-cleanup expired runs
 * 
 * Key format:
 * - Sorted Set Key: `runs:active:{workspaceId}:{projectId}:index`
 * - Hash Key (for details): `runs:active:{workspaceId}:{projectId}:data`
 * 
 * Sorted Set stores: {runUuid: timestamp}
 * Hash stores: {runUuid: JSON(ActiveRun)}
 */

const SORTED_SET_KEY = (workspaceId: number, projectId: number) =>
  `runs:active:${workspaceId}:${projectId}:index`

const DATA_HASH_KEY = (workspaceId: number, projectId: number) =>
  `runs:active:${workspaceId}:${projectId}:data`

/**
 * Optimized pagination using Redis Sorted Sets
 * This approach is significantly more memory-efficient for large datasets
 */
export async function listCachedRunsWithSortedSet(
  workspaceId: number,
  projectId: number,
  options: {
    page?: number
    pageSize?: number
    cache?: Cache
  } = {},
) {
  const { page = 1, pageSize = 25, cache: cacheClient } = options
  const redisCache = cacheClient ?? (await redis())

  const sortedSetKey = SORTED_SET_KEY(workspaceId, projectId)
  const dataHashKey = DATA_HASH_KEY(workspaceId, projectId)

  try {
    // Step 1: Clean up expired runs (older than TTL)
    const now = Date.now()
    const expiredThreshold = now - ACTIVE_RUN_CACHE_TTL
    await redisCache.zremrangebyscore(sortedSetKey, '-inf', expiredThreshold)

    // Step 2: Get paginated run UUIDs from sorted set (newest first)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    // ZREVRANGE gets in descending order (newest first)
    const runUuids = await redisCache.zrevrange(sortedSetKey, start, end)

    if (runUuids.length === 0) {
      return Result.ok([])
    }

    // Step 3: Get run details from hash (only for this page)
    const runDataList = await redisCache.hmget(dataHashKey, ...runUuids)

    // Step 4: Parse and return runs
    const activeRuns: ActiveRun[] = []
    for (let i = 0; i < runUuids.length; i++) {
      const jsonValue = runDataList[i]
      if (!jsonValue) continue

      try {
        const run = JSON.parse(jsonValue) as ActiveRun
        activeRuns.push({
          ...run,
          queuedAt: new Date(run.queuedAt),
          startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
        })
      } catch (parseError) {
        // Skip invalid entries
        continue
      }
    }

    return Result.ok(activeRuns)
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Get total count of active runs (for pagination)
 */
export async function countCachedRunsWithSortedSet(
  workspaceId: number,
  projectId: number,
  cache?: Cache,
): Promise<number> {
  const redisCache = cache ?? (await redis())
  const sortedSetKey = SORTED_SET_KEY(workspaceId, projectId)

  try {
    // Clean up expired runs first
    const now = Date.now()
    const expiredThreshold = now - ACTIVE_RUN_CACHE_TTL
    await redisCache.zremrangebyscore(sortedSetKey, '-inf', expiredThreshold)

    // Get count of remaining runs
    const count = await redisCache.zcard(sortedSetKey)
    return count
  } catch (error) {
    return 0
  }
}

/**
 * Helper function to add a run to the sorted set structure
 * This should be used in create.ts
 */
export async function addRunToSortedSet(
  workspaceId: number,
  projectId: number,
  run: ActiveRun,
  cache?: Cache,
) {
  const redisCache = cache ?? (await redis())
  const sortedSetKey = SORTED_SET_KEY(workspaceId, projectId)
  const dataHashKey = DATA_HASH_KEY(workspaceId, projectId)

  const score = run.startedAt?.getTime() ?? run.queuedAt.getTime()

  await Promise.all([
    // Add to sorted set with timestamp as score
    redisCache.zadd(sortedSetKey, score, run.uuid),
    // Store full run data in hash
    redisCache.hset(dataHashKey, run.uuid, JSON.stringify(run)),
    // Set TTL on both structures
    redisCache.expire(sortedSetKey, 3 * 60 * 60), // 3 hours
    redisCache.expire(dataHashKey, 3 * 60 * 60), // 3 hours
  ])
}

/**
 * Helper function to delete a run from the sorted set structure
 * This should be used in delete.ts
 */
export async function deleteRunFromSortedSet(
  workspaceId: number,
  projectId: number,
  runUuid: string,
  cache?: Cache,
) {
  const redisCache = cache ?? (await redis())
  const sortedSetKey = SORTED_SET_KEY(workspaceId, projectId)
  const dataHashKey = DATA_HASH_KEY(workspaceId, projectId)

  await Promise.all([
    redisCache.zrem(sortedSetKey, runUuid),
    redisCache.hdel(dataHashKey, runUuid),
  ])
}
