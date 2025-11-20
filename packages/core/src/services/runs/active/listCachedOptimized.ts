import {
  ACTIVE_RUN_CACHE_TTL,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../cache'
import { Result } from '../../../lib/Result'
import { migrateActiveRunsCache } from './migrateCache'

const HSCAN_BATCH_SIZE = 100 // Process runs in batches to avoid loading all at once

/**
 * Lazy-load active runs using HSCAN to avoid loading all runs into memory at once.
 * This is more memory-efficient than HGETALL when there are many active runs.
 */
async function lazyLoadActiveRuns(
  key: string,
  redisCache: Cache,
  maxRuns?: number,
): Promise<ActiveRun[]> {
  const activeRuns: ActiveRun[] = []
  const now = Date.now()
  let cursor = '0'
  let totalScanned = 0

  do {
    // HSCAN returns [cursor, [key1, val1, key2, val2, ...]]
    const [nextCursor, fields] = await redisCache.hscan(
      key,
      cursor,
      'COUNT',
      HSCAN_BATCH_SIZE,
    )

    // Process the batch
    for (let i = 0; i < fields.length; i += 2) {
      const runKey = fields[i]
      const jsonValue = fields[i + 1]

      if (!jsonValue) continue

      try {
        const run = JSON.parse(jsonValue) as ActiveRun
        const queuedAt = new Date(run.queuedAt)

        // Filter expired runs
        if (queuedAt.getTime() > now - ACTIVE_RUN_CACHE_TTL) {
          activeRuns.push({
            ...run,
            queuedAt,
            startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
          })

          // Early exit if we've collected enough runs
          if (maxRuns && activeRuns.length >= maxRuns) {
            return activeRuns
          }
        }
      } catch (parseError) {
        // Skip invalid entries
        continue
      }
    }

    cursor = nextCursor
    totalScanned += fields.length / 2

    // Safety check: stop if we've scanned too many
    if (totalScanned > 10000) {
      console.warn(
        `WARNING: Scanned ${totalScanned} runs, stopping for safety. Key: ${key}`,
      )
      break
    }
  } while (cursor !== '0')

  return activeRuns
}

/**
 * Optimized version of listCachedRuns that uses HSCAN for lazy loading
 * instead of HGETALL which loads everything into memory at once.
 */
export async function listCachedRunsOptimized(
  workspaceId: number,
  projectId: number,
  cache?: Cache,
  options?: {
    maxRuns?: number // Optional limit on how many runs to load
    useScan?: boolean // If false, use HGETALL for small datasets
  },
) {
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())
  const { maxRuns, useScan = true } = options || {}

  try {
    // For small datasets, HGETALL is faster than HSCAN
    // Check size first
    const hashSize = await redisCache.hlen(key)
    if (hashSize === 0) {
      return Result.ok([])
    }

    // If dataset is small (< 100 runs) or useScan is false, use HGETALL
    if (!useScan || hashSize < 100) {
      const hashData = await redisCache.hgetall(key)
      if (!hashData || Object.keys(hashData).length === 0) {
        return Result.ok([])
      }

      const activeRuns: ActiveRun[] = []
      const now = Date.now()

      for (const jsonValue of Object.values(hashData)) {
        try {
          const run = JSON.parse(jsonValue) as ActiveRun
          const queuedAt = new Date(run.queuedAt)

          if (queuedAt.getTime() > now - ACTIVE_RUN_CACHE_TTL) {
            activeRuns.push({
              ...run,
              queuedAt,
              startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
            })
          }
        } catch (parseError) {
          continue
        }
      }

      return Result.ok(activeRuns)
    }

    // For large datasets (>= 100 runs), use HSCAN for lazy loading
    console.log(
      `Using HSCAN for ${hashSize} active runs (workspace: ${workspaceId}, project: ${projectId})`,
    )

    const activeRuns = await lazyLoadActiveRuns(key, redisCache, maxRuns)

    if (hashSize > 500) {
      console.warn(
        `WARNING: Large number of active runs (${hashSize}) in cache for workspace ${workspaceId}, project ${projectId}. Consider investigating why runs are not being cleaned up.`,
      )
    }

    return Result.ok(activeRuns)
  } catch (error) {
    // Handle WRONGTYPE errors gracefully
    if (error instanceof Error && error.message.includes('WRONGTYPE')) {
      try {
        await migrateActiveRunsCache(workspaceId, projectId, redisCache)

        // Retry with HSCAN after migration
        const hashSize = await redisCache.hlen(key)
        if (hashSize === 0) {
          return Result.ok([])
        }

        const activeRuns = await lazyLoadActiveRuns(key, redisCache, maxRuns)
        return Result.ok(activeRuns)
      } catch (retryError) {
        return Result.ok([])
      }
    }
    return Result.error(error as Error)
  }
}
