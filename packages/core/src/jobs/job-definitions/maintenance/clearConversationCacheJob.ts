import { Job } from 'bullmq'
import { diskFactory } from '../../../lib/disk'
import { CONVERSATION_CACHE_PREFIX } from '../../../services/conversations/cache'

export type ClearConversationCacheJobData = Record<string, never>

/**
 * Clears the cached conversations stored on disk.
 */
export async function clearConversationCacheJob(
  _: Job<ClearConversationCacheJobData>,
) {
  const disk = diskFactory('private')
  return disk.deleteAll(CONVERSATION_CACHE_PREFIX)
}
