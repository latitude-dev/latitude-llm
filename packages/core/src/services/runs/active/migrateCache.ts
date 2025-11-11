import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_CACHE_KEY,
} from '@latitude-data/constants'
import { Cache } from '../../../cache'

/**
 * Migrates active runs cache from old STRING format to new HASH format.
 * This handles the case where old deployments stored active runs as a JSON string,
 * but new code expects a Redis hash.
 */
export async function migrateActiveRunsCache(
  workspaceId: number,
  projectId: number,
  cache: Cache,
): Promise<void> {
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  try {
    // Check the type of the key to handle migration from old format
    const keyType = await cache.type(key)

    // If key is a STRING (old format), migrate it to HASH
    if (keyType === 'string') {
      const oldValue = await cache.get(key)
      if (oldValue) {
        try {
          // Old format might have been a JSON array or object
          const parsed = JSON.parse(oldValue)
          const runs = Array.isArray(parsed) ? parsed : Object.values(parsed)

          // Delete the old key
          await cache.del(key)

          // Convert to hash format
          if (runs.length > 0) {
            const pipeline = cache.pipeline()
            for (const run of runs) {
              if (run && run.uuid) {
                const jsonValue = JSON.stringify(run)
                pipeline.hset(key, run.uuid, jsonValue)
              }
            }
            // Set TTL on the hash
            pipeline.expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
            await pipeline.exec()
          }
        } catch (parseError) {
          // If we can't parse the old value, just delete it
          await cache.del(key)
        }
      } else {
        // Empty string value, just delete it
        await cache.del(key)
      }
    }
  } catch (error) {
    // If migration fails, we'll let the calling code handle the error
    // This ensures we don't break the flow if there's a Redis connection issue
  }
}
