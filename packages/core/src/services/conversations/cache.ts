import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { promisify } from 'node:util'
import { gzip, gunzip } from 'node:zlib'
import { cache } from '../../cache'
import { diskFactory } from '../../lib/disk'
import { Result, TypedResult } from '../../lib/Result'
import { captureException } from '../../utils/datadogCapture'
import { BadRequestError } from '@latitude-data/constants/errors'

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
export const CONVERSATION_CACHE_BUCKET_INDEX_KEY = `${CONVERSATION_CACHE_PREFIX}:buckets`
export const CONVERSATION_CACHE_TTL_MS = 30 * 60 * 1000 // The TTL of a conversation cache entry is 30 minutes
export const CONVERSATION_CACHE_BUCKET_MS = 5 * 60 * 1000 // Conversations are stored in buckets of 5 minutes so that it's easier to delete them later

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

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
  const lookupKey = buildConversationCacheLookupKey(documentLogUuid)
  const disk = diskFactory('private')

  const cacheClient = await cache()
  const resolvedKey = await cacheClient.get(lookupKey)
  if (!resolvedKey) {
    const legacyKey = buildLegacyConversationCacheKey({
      workspaceId,
      documentLogUuid,
    })
    const legacyResult = await readConversationCacheFromDisk({
      disk,
      key: legacyKey,
      compressed: false,
    })
    if (legacyResult.error) return legacyResult

    const legacyEntry = legacyResult.value
    if (!legacyEntry) return Result.nil()
    return Result.ok(legacyEntry)
  }

  try {
    const entryResult = await readConversationCacheFromDisk({
      disk,
      key: resolvedKey,
      compressed: true,
    })
    if (entryResult.error) return entryResult

    const entry = entryResult.value
    if (!entry) {
      await removeConversationCacheLookupKey(documentLogUuid)
      captureException(
        new Error(`Cache entry not found for key: ${resolvedKey}`),
        {
          context: 'conversation-cache',
          documentLogUuid,
        },
      )
      return Result.nil()
    }

    return Result.ok(entry)
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
  const disk = diskFactory('private')

  const expiresAt = Date.now() + ttlMs
  const key = buildConversationCacheKey({
    documentLogUuid: entry.documentLogUuid,
    expiresAt,
  })
  const lookupKey = buildConversationCacheLookupKey(entry.documentLogUuid)
  const envelope: CacheEnvelope = {
    expiresAt,
    data: entry,
  }
  const payload = JSON.stringify(envelope)
  const compressed = await gzipAsync(payload)
  const encoded = compressed.toString('base64')

  const writeResult = await disk.put(key, encoded)
  if (writeResult.error) return writeResult

  const cacheClient = await cache()
  await cacheClient.set(lookupKey, key, 'PX', ttlMs)
  await upsertConversationCacheBucketIndex(key, expiresAt)
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
    const buffer = Buffer.from(payload, 'base64')
    const decompressed = await gunzipAsync(buffer)
    const envelope = JSON.parse(decompressed.toString()) as CacheEnvelope
    return Date.now() > envelope.expiresAt
  } catch {
    return true
  }
}

function buildConversationCacheKey({
  documentLogUuid,
  expiresAt,
}: {
  documentLogUuid: string
  expiresAt: number
}) {
  const bucketId = Math.floor(expiresAt / CONVERSATION_CACHE_BUCKET_MS)
  return `${CONVERSATION_CACHE_PREFIX}/${bucketId}/${documentLogUuid}.json.gz`
}

function buildConversationCacheLookupKey(documentLogUuid: string) {
  return `${CONVERSATION_CACHE_PREFIX}:lookup:${documentLogUuid}`
}

function buildLegacyConversationCacheKey({
  workspaceId,
  documentLogUuid,
}: {
  workspaceId: number
  documentLogUuid: string
}) {
  return `${CONVERSATION_CACHE_PREFIX}/${workspaceId}/${documentLogUuid}.json`
}

async function readConversationCacheFromDisk({
  disk,
  key,
  compressed,
}: {
  disk: ReturnType<typeof diskFactory>
  key: string
  compressed: boolean
}): Promise<TypedResult<ConversationCacheEntry | undefined>> {
  const exists = await disk.exists(key)
  if (!exists) return Result.nil()

  const payload = await disk.get(key)
  const decoded = compressed
    ? await gunzipAsync(Buffer.from(payload, 'base64')).then((buffer) =>
        buffer.toString(),
      )
    : payload
  const envelope = JSON.parse(decoded) as CacheEnvelope

  if (Date.now() > envelope.expiresAt) {
    await disk.delete(key)
    captureException(
      new BadRequestError(`Cache entry expired for key: ${key}`),
      {
        context: 'conversation-cache',
      },
    )
    return Result.nil()
  }

  return Result.ok(envelope.data)
}

async function upsertConversationCacheBucketIndex(
  key: string,
  expiresAt: number,
) {
  try {
    const cacheClient = await cache()
    const bucketPrefix = key.split('/').slice(0, -1).join('/')
    const bucketExpiresAt =
      (Math.floor(expiresAt / CONVERSATION_CACHE_BUCKET_MS) + 1) *
      CONVERSATION_CACHE_BUCKET_MS
    await cacheClient.zadd(
      CONVERSATION_CACHE_BUCKET_INDEX_KEY,
      bucketExpiresAt,
      bucketPrefix,
    )

    // We remove stale bucket indeces from the sorted set every 4 times the TTL,
    // this means the cleanup job failed to clean up the index for some reason
    // for at least 2 hours.
    const staleThreshold = Date.now() - CONVERSATION_CACHE_TTL_MS * 4 // 2 hours
    await cacheClient.zremrangebyscore(
      CONVERSATION_CACHE_BUCKET_INDEX_KEY,
      0,
      staleThreshold,
    )
  } catch {
    // do nothing
  }
}

async function removeConversationCacheLookupKey(documentLogUuid: string) {
  try {
    const cacheClient = await cache()
    await cacheClient.del(buildConversationCacheLookupKey(documentLogUuid))
  } catch {
    // do nothing
  }
}
