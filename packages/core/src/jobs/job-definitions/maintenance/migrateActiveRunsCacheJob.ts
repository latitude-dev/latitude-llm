import { Job } from 'bullmq'
import { cache } from '../../../cache'
import { migrateActiveRunsCache } from '../../../services/runs/active/migrateCache'
import { REDIS_KEY_PREFIX } from '../../../redis'

export type MigrateActiveRunsCacheJobData = Record<string, never>

/**
 * Job that migrates all active runs cache keys from old STRING format to new HASH format.
 *
 * This job:
 * 1. Uses SCAN with pattern matching to efficiently find only active runs cache keys
 * 2. For each key, checks if it's a STRING type (old format)
 * 3. If it is, migrates it to HASH format using the existing migration function
 *
 * Performance characteristics:
 * - Uses SCAN (non-blocking) instead of KEYS (blocking)
 * - Uses pattern matching to only scan relevant keys (much faster than scanning all keys)
 * - Processes keys in batches of 100 to avoid memory issues
 * - Does NOT block Redis - SCAN is cursor-based and yields between iterations
 *
 * This job is idempotent and safe to run multiple times.
 * It only processes keys matching the active runs cache pattern, ignoring all other Redis keys.
 */
export const migrateActiveRunsCacheJob = async (
  _: Job<MigrateActiveRunsCacheJobData>,
) => {
  const redisCache = await cache()
  // Pattern for active runs cache keys: runs:active:${workspaceId}:${projectId}
  // Use pattern matching to only scan relevant keys (much faster than scanning all keys)
  // Include the Redis keyPrefix explicitly in the pattern to match keys correctly
  // Pattern format: latitude:runs:active:*:* matches the actual keys in Redis
  const pattern = `${REDIS_KEY_PREFIX}runs:active:*:*`

  let migratedCount = 0
  let skippedCount = 0
  let errorCount = 0

  // Use SCAN with pattern to only get relevant keys (non-blocking, efficient)
  // IMPORTANT: SCAN is non-blocking and will NOT block Redis, even with millions of keys.
  // SCAN uses cursors and yields between iterations, allowing other operations to proceed.
  // Pattern matching makes this much faster by only scanning relevant keys instead of all keys.
  let cursor = '0'

  do {
    // SCAN returns [cursor, keys]
    // Use pattern to only get active runs cache keys
    // COUNT=100 means we process ~100 keys per iteration (approximate, Redis may return more or less)
    const [nextCursor, keys] = await redisCache.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100,
    )
    cursor = nextCursor

    // Process keys in batches
    for (const key of keys) {
      try {
        // ioredis returns keys from scan() with the keyPrefix already included
        // Remove the prefix to get the actual key
        const keyWithoutPrefix = key.startsWith(REDIS_KEY_PREFIX)
          ? key.slice(REDIS_KEY_PREFIX.length)
          : key

        // Validate key format (should already match pattern, but double-check)
        // Key format: runs:active:${workspaceId}:${projectId}
        const parts = keyWithoutPrefix.split(':')
        if (
          parts.length !== 4 ||
          parts[0] !== 'runs' ||
          parts[1] !== 'active'
        ) {
          skippedCount++
          continue
        }

        const workspaceId = parseInt(parts[2], 10)
        const projectId = parseInt(parts[3], 10)

        if (isNaN(workspaceId) || isNaN(projectId)) {
          skippedCount++
          continue
        }

        // Check if key needs migration
        // Use keyWithoutPrefix for type() since ioredis will add the prefix automatically
        const keyType = await redisCache.type(keyWithoutPrefix)

        if (keyType === 'string') {
          // Key is in old format, migrate it
          await migrateActiveRunsCache(workspaceId, projectId, redisCache)
          migratedCount++
        } else {
          skippedCount++
        }
      } catch (error) {
        errorCount++
        // Continue with other keys even if one fails
      }
    }
  } while (cursor !== '0')

  return {
    migrated: migratedCount,
    skipped: skippedCount,
    errors: errorCount,
  }
}
