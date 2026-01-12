import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { cache } from '../../cache'
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

/** Internal type that wraps the entry with TTL metadata */
type CacheEnvelope = {
  expiresAt: number
  data: ConversationCacheEntry
}

export const CONVERSATION_CACHE_PREFIX = 'conversation-cache'
export const CONVERSATION_CACHE_INDEX_KEY = `${CONVERSATION_CACHE_PREFIX}:index`
export const CONVERSATION_CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Reads a cached conversation entry from disk.
 * Returns undefined if the cache doesn't exist or has expired.
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
  if (!exists) {
    await removeConversationCacheIndexEntry(key)
    return Result.nil()
  }

  try {
    const payload = await disk.get(key)
    const envelope = JSON.parse(payload) as CacheEnvelope

    if (Date.now() > envelope.expiresAt) {
      await disk.delete(key)
      await removeConversationCacheIndexEntry(key)
      return Result.nil()
    }

    return Result.ok(envelope.data)
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Writes a cached conversation entry to disk with TTL.
 */
export async function writeConversationCache(
  entry: ConversationCacheEntry,
  ttlMs: number = CONVERSATION_CACHE_TTL_MS,
): Promise<TypedResult> {
  const key = buildConversationCacheKey({
    workspaceId: entry.workspaceId,
    documentLogUuid: entry.documentLogUuid,
  })
  const disk = diskFactory('private')

  const expiresAt = Date.now() + ttlMs
  const envelope: CacheEnvelope = {
    expiresAt,
    data: entry,
  }
  const payload = JSON.stringify(envelope)

  const writeResult = await disk.put(key, payload)
  if (writeResult.error) return writeResult

  await upsertConversationCacheIndex(key, expiresAt)
  return Result.nil()
}

/**
 * Checks if a cache entry is expired by reading its metadata.
 * Returns true if the entry exists and is expired.
 */
export async function isCacheEntryExpired(key: string): Promise<boolean> {
  const disk = diskFactory('private')

  try {
    const exists = await disk.exists(key)
    if (!exists) return false

    const payload = await disk.get(key)
    const envelope = JSON.parse(payload) as CacheEnvelope
    return Date.now() > envelope.expiresAt
  } catch {
    return true
  }
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

async function upsertConversationCacheIndex(key: string, expiresAt: number) {
  try {
    const cacheClient = await cache()
    await cacheClient.zadd(CONVERSATION_CACHE_INDEX_KEY, expiresAt, key)
  } catch {
    // do nothing
  }
}

async function removeConversationCacheIndexEntry(key: string) {
  try {
    const cacheClient = await cache()
    await cacheClient.zrem(CONVERSATION_CACHE_INDEX_KEY, key)
  } catch {
    // do nothing
  }
}
