import { Job } from 'bullmq'
import { cache } from '../../../cache'
import { diskFactory } from '../../../lib/disk'
import { CONVERSATION_CACHE_BUCKET_INDEX_KEY } from '../../../services/conversations/cache'
import { Result } from '../../../lib/Result'
import { captureException } from '../../../utils/datadogCapture'

export type ClearConversationCacheJobData = Record<string, never>

/**
 * Clears expired conversation cache entries from disk storage.
 *
 * Uses a Redis sorted set as an expiration index where:
 * - Members are disk bucket prefixes (paths to conversation data)
 * - Scores are expiration timestamps
 *
 * The job processes expired buckets in batches of 1000:
 * 1. Queries Redis for entries with scores (expiration timestamps) ≤ current time
 * 2. Deletes all files under each expired bucket prefix from disk
 * 3. Removes successfully deleted prefixes from the Redis sorted set
 * 4. Repeats until no more expired buckets remain
 *
 * This approach avoids scanning the entire disk to find expired data.
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
      const buckets = await cacheClient.zrangebyscore(
        CONVERSATION_CACHE_BUCKET_INDEX_KEY,
        0,
        now,
        'LIMIT',
        0,
        batchSize,
      )
      if (buckets.length === 0) {
        return Result.nil()
      }

      const deleteResults = await Promise.all(
        buckets.map(async (prefix) => ({
          prefix,
          result: await disk.deleteAll(prefix),
        })),
      )

      const deletedBuckets = deleteResults
        .filter(({ result }) => result.ok)
        .map(({ prefix }) => prefix)

      if (deletedBuckets.length > 0) {
        await cacheClient.zrem(
          CONVERSATION_CACHE_BUCKET_INDEX_KEY,
          ...deletedBuckets,
        )
      }

      const errorResult = deleteResults.find(({ result }) => result.error)
      if (errorResult?.result && !Result.isOk(errorResult?.result)) {
        errorResult.result.unwrap()
      }
    }
  } catch (error) {
    captureException(error as Error, { job: 'clearConversationCacheJob' })
  }
}
