import { Job } from 'bullmq'
import { cache } from '../../../cache'
import { diskFactory } from '../../../lib/disk'
import { CONVERSATION_CACHE_INDEX_KEY } from '../../../services/conversations/cache'
import { Result } from '../../../lib/Result'

export type ClearConversationCacheJobData = Record<string, never>

/**
 * Clears expired cached conversations from disk.
 * Uses the expiration index to avoid scanning the disk.
 */
export async function clearConversationCacheJob(
  _: Job<ClearConversationCacheJobData>,
) {
  const disk = diskFactory('private')
  const cacheClient = await cache()
  const now = Date.now()
  const batchSize = 1000

  try {
    while (true) {
      const keys = await cacheClient.zrangebyscore(
        CONVERSATION_CACHE_INDEX_KEY,
        0,
        now,
        'LIMIT',
        0,
        batchSize,
      )
      if (keys.length === 0) return Result.nil()

      const deleteResults = await Promise.all(
        keys.map(async (key) => ({
          key,
          result: await disk.delete(key),
        })),
      )

      const deletedKeys = deleteResults
        .filter(({ result }) => result.ok)
        .map(({ key }) => key)

      if (deletedKeys.length > 0) {
        await cacheClient.zrem(CONVERSATION_CACHE_INDEX_KEY, ...deletedKeys)
      }

      const errorResult = deleteResults.find(({ result }) => result.error)
      if (errorResult?.result.error) {
        return Result.error(errorResult.result.error)
      }
    }
  } catch (error) {
    return Result.error(error as Error)
  }
}
