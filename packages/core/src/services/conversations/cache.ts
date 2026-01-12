import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { diskFactory } from '../../lib/disk'
import { Result, TypedResult } from '../../lib/Result'

export type ConversationCacheEntry = {
  documentLogUuid: string
  workspaceId: number
  commitUuid: string
  documentUuid: string
  providerId?: number
  messages: LegacyMessage[]
}

export const CONVERSATION_CACHE_PREFIX = 'conversation-cache'

/**
 * Reads a cached conversation entry from disk.
 */
export async function readConversationCache({
  workspaceId,
  documentLogUuid,
}: {
  workspaceId: number
  documentLogUuid: string
}): Promise<TypedResult<ConversationCacheEntry | undefined>> {
  const key = buildConversationCacheKey({ workspaceId, documentLogUuid })
  const disk = diskFactory('private')

  const exists = await disk.exists(key)
  if (!exists) return Result.nil()

  try {
    const payload = await disk.get(key)
    const parsed = JSON.parse(payload) as ConversationCacheEntry
    return Result.ok(parsed)
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Writes a cached conversation entry to disk.
 */
export async function writeConversationCache(
  entry: ConversationCacheEntry,
): Promise<TypedResult> {
  const key = buildConversationCacheKey({
    workspaceId: entry.workspaceId,
    documentLogUuid: entry.documentLogUuid,
  })
  const disk = diskFactory('private')
  const payload = JSON.stringify(entry)

  return disk.put(key, payload)
}

function buildConversationCacheKey({
  workspaceId,
  documentLogUuid,
}: {
  workspaceId: number
  documentLogUuid: string
}) {
  return `${CONVERSATION_CACHE_PREFIX}/${workspaceId}/${documentLogUuid}.json`
}
