import { beforeEach, describe, expect, it, vi } from 'vitest'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

import * as cacheModule from '../../cache'
import * as diskModule from '../../lib/disk'
import {
  ConversationCacheEntry,
  CONVERSATION_CACHE_BUCKET_INDEX_KEY,
  CONVERSATION_CACHE_BUCKET_MS,
  CONVERSATION_CACHE_PREFIX,
  CONVERSATION_CACHE_TTL_MS,
  isCacheEntryExpired,
  readConversationCache,
  writeConversationCache,
} from './cache'
import { Result } from '../../lib/Result'

const gzipAsync = promisify(gzip)

describe('conversationCache', () => {
  const mockDisk = {
    exists: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }

  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    zadd: vi.fn(),
    zremrangebyscore: vi.fn(),
  }

  const mockEntry: ConversationCacheEntry = {
    documentLogUuid: 'doc-log-uuid-123',
    workspaceId: 1,
    commitUuid: 'commit-uuid-456',
    documentUuid: 'document-uuid-789',
    providerId: 42,
    messages: [
      {
        role: 'user',
        content: 'Hello',
      },
      {
        role: 'assistant',
        content: 'Hi there!',
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(diskModule, 'diskFactory').mockReturnValue(mockDisk as any)
    vi.spyOn(cacheModule, 'cache').mockResolvedValue(mockCache as any)
  })

  describe('readConversationCache', () => {
    it('returns undefined when lookup key does not exist and legacy key does not exist', async () => {
      mockCache.get.mockResolvedValueOnce(null)
      mockDisk.exists.mockResolvedValueOnce(false)

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeUndefined()
      expect(mockCache.get).toHaveBeenCalledWith(
        `${CONVERSATION_CACHE_PREFIX}:lookup:doc-log-uuid-123`,
      )
    })

    it('reads from legacy uncompressed format when lookup key does not exist', async () => {
      mockCache.get.mockResolvedValueOnce(null)
      mockDisk.exists.mockResolvedValueOnce(true)

      const expiresAt = Date.now() + CONVERSATION_CACHE_TTL_MS
      const envelope = { expiresAt, data: mockEntry }
      mockDisk.get.mockResolvedValueOnce(JSON.stringify(envelope))

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual(mockEntry)
      expect(mockDisk.exists).toHaveBeenCalledWith(
        `${CONVERSATION_CACHE_PREFIX}/1/doc-log-uuid-123.json`,
      )
    })

    it('reads from compressed format when lookup key exists', async () => {
      const resolvedKey = `${CONVERSATION_CACHE_PREFIX}/12345/doc-log-uuid-123.json.gz`
      mockCache.get.mockResolvedValueOnce(resolvedKey)
      mockDisk.exists.mockResolvedValueOnce(true)

      const expiresAt = Date.now() + CONVERSATION_CACHE_TTL_MS
      const envelope = { expiresAt, data: mockEntry }
      const compressed = await gzipAsync(JSON.stringify(envelope))
      mockDisk.get.mockResolvedValueOnce(compressed.toString('base64'))

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual(mockEntry)
      expect(mockDisk.exists).toHaveBeenCalledWith(resolvedKey)
    })

    it('returns undefined and removes lookup key when disk file does not exist', async () => {
      const resolvedKey = `${CONVERSATION_CACHE_PREFIX}/12345/doc-log-uuid-123.json.gz`
      mockCache.get.mockResolvedValueOnce(resolvedKey)
      mockDisk.exists.mockResolvedValueOnce(false)

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeUndefined()
      expect(mockCache.del).toHaveBeenCalledWith(
        `${CONVERSATION_CACHE_PREFIX}:lookup:doc-log-uuid-123`,
      )
    })

    it('returns undefined when legacy entry is expired', async () => {
      mockCache.get.mockResolvedValueOnce(null)
      mockDisk.exists.mockResolvedValueOnce(true)

      const expiresAt = Date.now() - 1000
      const envelope = { expiresAt, data: mockEntry }
      mockDisk.get.mockResolvedValueOnce(JSON.stringify(envelope))

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeUndefined()
      expect(mockDisk.delete).toHaveBeenCalled()
    })

    it('returns undefined when compressed entry is expired', async () => {
      const resolvedKey = `${CONVERSATION_CACHE_PREFIX}/12345/doc-log-uuid-123.json.gz`
      mockCache.get.mockResolvedValueOnce(resolvedKey)
      mockDisk.exists.mockResolvedValueOnce(true)

      const expiresAt = Date.now() - 1000
      const envelope = { expiresAt, data: mockEntry }
      const compressed = await gzipAsync(JSON.stringify(envelope))
      mockDisk.get.mockResolvedValueOnce(compressed.toString('base64'))

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeUndefined()
      expect(mockDisk.delete).toHaveBeenCalledWith(resolvedKey)
    })

    it('returns error when disk.get throws', async () => {
      const resolvedKey = `${CONVERSATION_CACHE_PREFIX}/12345/doc-log-uuid-123.json.gz`
      mockCache.get.mockResolvedValueOnce(resolvedKey)
      mockDisk.exists.mockResolvedValueOnce(true)
      mockDisk.get.mockRejectedValueOnce(new Error('Disk read error'))

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toBe('Disk read error')
    })
  })

  describe('writeConversationCache', () => {
    it('writes compressed entry to disk with lookup key in cache', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())

      const result = await writeConversationCache(mockEntry)

      expect(result.ok).toBe(true)
      expect(mockDisk.put).toHaveBeenCalledTimes(1)

      const putCall = mockDisk.put.mock.calls[0]
      expect(putCall[0]).toMatch(
        new RegExp(
          `^${CONVERSATION_CACHE_PREFIX}/\\d+/doc-log-uuid-123.json.gz$`,
        ),
      )

      expect(mockCache.set).toHaveBeenCalledWith(
        `${CONVERSATION_CACHE_PREFIX}:lookup:doc-log-uuid-123`,
        expect.stringMatching(
          new RegExp(
            `^${CONVERSATION_CACHE_PREFIX}/\\d+/doc-log-uuid-123.json.gz$`,
          ),
        ),
        'PX',
        CONVERSATION_CACHE_TTL_MS,
      )
    })

    it('uses custom TTL when provided', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())
      const customTtl = 60 * 1000

      await writeConversationCache(mockEntry, customTtl)

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        customTtl,
      )
    })

    it('updates bucket index with expiration time', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())

      await writeConversationCache(mockEntry)

      expect(mockCache.zadd).toHaveBeenCalledWith(
        CONVERSATION_CACHE_BUCKET_INDEX_KEY,
        expect.any(Number),
        expect.stringMatching(
          new RegExp(`^${CONVERSATION_CACHE_PREFIX}/\\d+$`),
        ),
      )
    })

    it('removes stale bucket indices', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())

      await writeConversationCache(mockEntry)

      expect(mockCache.zremrangebyscore).toHaveBeenCalledWith(
        CONVERSATION_CACHE_BUCKET_INDEX_KEY,
        0,
        expect.any(Number),
      )
    })

    it('returns error when disk.put fails', async () => {
      const diskError = new Error('Disk write error')
      mockDisk.put.mockResolvedValueOnce(Result.error(diskError))

      const result = await writeConversationCache(mockEntry)

      expect(result.ok).toBe(false)
      expect(result.error).toBe(diskError)
      expect(mockCache.set).not.toHaveBeenCalled()
    })

    it('stores compressed base64 encoded data', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())

      await writeConversationCache(mockEntry)

      const putCall = mockDisk.put.mock.calls[0]
      const encodedData = putCall[1]

      const buffer = Buffer.from(encodedData, 'base64')
      const { gunzip } = await import('node:zlib')
      const gunzipAsync = promisify(gunzip)
      const decompressed = await gunzipAsync(buffer)
      const envelope = JSON.parse(decompressed.toString())

      expect(envelope.data).toEqual(mockEntry)
      expect(envelope.expiresAt).toBeGreaterThan(Date.now())
    })

    it('calculates bucket id based on expiration time', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())
      const now = Date.now()
      const expectedExpiresAt = now + CONVERSATION_CACHE_TTL_MS
      const expectedBucketId = Math.floor(
        expectedExpiresAt / CONVERSATION_CACHE_BUCKET_MS,
      )

      await writeConversationCache(mockEntry)

      const putCall = mockDisk.put.mock.calls[0]
      const key = putCall[0]

      expect(key).toContain(`/${expectedBucketId}/`)
    })
  })

  describe('isCacheEntryExpired', () => {
    it('returns false when file does not exist', async () => {
      mockDisk.exists.mockResolvedValueOnce(false)

      const result = await isCacheEntryExpired('some-key')

      expect(result).toBe(false)
    })

    it('returns false when entry is not expired', async () => {
      mockDisk.exists.mockResolvedValueOnce(true)

      const expiresAt = Date.now() + CONVERSATION_CACHE_TTL_MS
      const envelope = { expiresAt, data: mockEntry }
      const compressed = await gzipAsync(JSON.stringify(envelope))
      mockDisk.get.mockResolvedValueOnce(compressed.toString('base64'))

      const result = await isCacheEntryExpired('some-key')

      expect(result).toBe(false)
    })

    it('returns true when entry is expired', async () => {
      mockDisk.exists.mockResolvedValueOnce(true)

      const expiresAt = Date.now() - 1000
      const envelope = { expiresAt, data: mockEntry }
      const compressed = await gzipAsync(JSON.stringify(envelope))
      mockDisk.get.mockResolvedValueOnce(compressed.toString('base64'))

      const result = await isCacheEntryExpired('some-key')

      expect(result).toBe(true)
    })

    it('returns true when decompression fails', async () => {
      mockDisk.exists.mockResolvedValueOnce(true)
      mockDisk.get.mockResolvedValueOnce(
        'invalid-base64-data-that-is-not-gzipped',
      )

      const result = await isCacheEntryExpired('some-key')

      expect(result).toBe(true)
    })

    it('returns true when parsing fails', async () => {
      mockDisk.exists.mockResolvedValueOnce(true)
      const compressed = await gzipAsync('not-valid-json')
      mockDisk.get.mockResolvedValueOnce(compressed.toString('base64'))

      const result = await isCacheEntryExpired('some-key')

      expect(result).toBe(true)
    })
  })

  describe('bucket key calculation', () => {
    it('groups entries into 5-minute buckets', async () => {
      mockDisk.put.mockResolvedValue(Result.nil())

      const bucketMs = CONVERSATION_CACHE_BUCKET_MS
      expect(bucketMs).toBe(5 * 60 * 1000)
    })

    it('uses 30-minute TTL by default', async () => {
      expect(CONVERSATION_CACHE_TTL_MS).toBe(30 * 60 * 1000)
    })
  })

  describe('error handling', () => {
    it('silently handles cache zadd failures', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())
      mockCache.zadd.mockRejectedValueOnce(new Error('Redis error'))

      const result = await writeConversationCache(mockEntry)

      expect(result.ok).toBe(true)
    })

    it('silently handles cache zremrangebyscore failures', async () => {
      mockDisk.put.mockResolvedValueOnce(Result.nil())
      mockCache.zremrangebyscore.mockRejectedValueOnce(new Error('Redis error'))

      const result = await writeConversationCache(mockEntry)

      expect(result.ok).toBe(true)
    })

    it('silently handles lookup key deletion failures', async () => {
      const resolvedKey = `${CONVERSATION_CACHE_PREFIX}/12345/doc-log-uuid-123.json.gz`
      mockCache.get.mockResolvedValueOnce(resolvedKey)
      mockDisk.exists.mockResolvedValueOnce(false)
      mockCache.del.mockRejectedValueOnce(new Error('Redis error'))

      const result = await readConversationCache({
        workspaceId: 1,
        documentLogUuid: 'doc-log-uuid-123',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeUndefined()
    })
  })
})
