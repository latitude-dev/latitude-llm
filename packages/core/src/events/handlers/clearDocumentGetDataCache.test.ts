import { HEAD_COMMIT, ModifiedDocumentType } from '@latitude-data/constants'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../cache'
import { cache } from '../../cache'
import { getDataCacheKey } from '../../services/documents/getDataCacheKey'
import {
  CommitPublishedEvent,
  DocumentCreatedEvent,
  DocumentsDeletedEvent,
} from '../events'
import { clearDocumentGetDataCache } from './clearDocumentGetDataCache'

describe('clearDocumentGetDataCache', () => {
  let redis: Cache
  let workspaceId: number
  let projectId: number
  let testCounter = Math.floor(Date.now() / 100)
  const testKeys = new Set<string>()

  const trackKey = (key: string) => {
    testKeys.add(key)
    return key
  }

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(() => {
    workspaceId = testCounter++
    projectId = testCounter++
    testKeys.clear()
  })

  afterEach(async () => {
    for (const key of testKeys) {
      await redis.del(key)
    }
    testKeys.clear()
  })

  it('clears the cache for a documentCreated event', async () => {
    const commitUuid = 'commit-uuid-create'
    const path = 'docs/created'
    const key = trackKey(
      getDataCacheKey({
        workspaceId,
        projectId,
        commitUuid,
        documentPath: path,
      }),
    )
    await redis.set(key, 'cached')

    const event: DocumentCreatedEvent = {
      type: 'documentCreated',
      data: {
        workspaceId,
        projectId,
        commitUuid,
        document: {
          path,
        } as DocumentCreatedEvent['data']['document'],
      },
    }

    await clearDocumentGetDataCache({ data: event })

    expect(await redis.get(key)).toBeNull()
  })

  it('clears the cache for every path on documentsDeleted', async () => {
    const commitUuid = 'commit-uuid-delete'
    const paths = ['docs/a', 'docs/b']
    const keys = paths.map((path) =>
      trackKey(
        getDataCacheKey({
          workspaceId,
          projectId,
          commitUuid,
          documentPath: path,
        }),
      ),
    )
    await Promise.all(keys.map((key) => redis.set(key, 'cached')))

    const event: DocumentsDeletedEvent = {
      type: 'documentsDeleted',
      data: {
        workspaceId,
        projectId,
        commitUuid,
        documentUuids: ['uuid-a', 'uuid-b'],
        documentPaths: paths,
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [],
      },
    }

    await clearDocumentGetDataCache({ data: event })

    for (const key of keys) {
      expect(await redis.get(key)).toBeNull()
    }
  })

  it('clears both the live and merged-commit cache keys for every changed path on commitPublished', async () => {
    const commitUuid = 'commit-uuid-publish'
    const otherCommitUuid = 'commit-uuid-untouched'
    const changedPath = 'prompts/changed'
    const otherPath = 'prompts/untouched'

    const liveKey = trackKey(
      getDataCacheKey({
        workspaceId,
        projectId,
        commitUuid: HEAD_COMMIT,
        documentPath: changedPath,
      }),
    )
    const mergedKey = trackKey(
      getDataCacheKey({
        workspaceId,
        projectId,
        commitUuid,
        documentPath: changedPath,
      }),
    )
    const unrelatedLiveKey = trackKey(
      getDataCacheKey({
        workspaceId,
        projectId,
        commitUuid: HEAD_COMMIT,
        documentPath: otherPath,
      }),
    )
    const unrelatedCommitKey = trackKey(
      getDataCacheKey({
        workspaceId,
        projectId,
        commitUuid: otherCommitUuid,
        documentPath: changedPath,
      }),
    )

    await Promise.all([
      redis.set(liveKey, 'stale'),
      redis.set(mergedKey, 'stale'),
      redis.set(unrelatedLiveKey, 'fresh'),
      redis.set(unrelatedCommitKey, 'fresh'),
    ])

    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId,
        userEmail: 'test@example.com',
        commit: {
          uuid: commitUuid,
          projectId,
        } as CommitPublishedEvent['data']['commit'],
        changedDocuments: [
          { path: changedPath, changeType: ModifiedDocumentType.Updated },
        ],
      },
    }

    await clearDocumentGetDataCache({ data: event })

    expect(await redis.get(liveKey)).toBeNull()
    expect(await redis.get(mergedKey)).toBeNull()
    expect(await redis.get(unrelatedLiveKey)).toBe('fresh')
    expect(await redis.get(unrelatedCommitKey)).toBe('fresh')
  })

  it('does nothing when commitPublished has no changed documents', async () => {
    const event: CommitPublishedEvent = {
      type: 'commitPublished',
      data: {
        workspaceId,
        userEmail: 'test@example.com',
        commit: {
          uuid: 'commit-uuid-empty',
          projectId,
        } as CommitPublishedEvent['data']['commit'],
        changedDocuments: [],
      },
    }

    await expect(
      clearDocumentGetDataCache({ data: event }),
    ).resolves.not.toThrow()
  })
})
