import {
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
  LogSources,
} from '@latitude-data/constants'
import { DEFAULT_PAGINATION_SIZE } from '../../../../constants'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../../cache'
import { cache } from '../../../../cache'
import { createActiveRunByDocument } from './create'
import { listActiveRunsByDocument } from './listByDocument'
import { updateActiveRunByDocument } from './update'

describe('listActiveRunsByDocument', () => {
  let redis: Cache
  let workspaceId: number
  let projectId: number
  let documentUuid: string
  let commitUuid: string
  const testKeys = new Set<string>()
  let testCounter = Date.now()

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(async () => {
    // Generate unique IDs for each test to avoid collisions in parallel execution
    const uniqueId = `${testCounter++}-${Math.random().toString(36).substring(7)}`
    workspaceId = testCounter++
    projectId = testCounter++
    documentUuid = `doc-${uniqueId}`
    commitUuid = `commit-${uniqueId}`
    testKeys.clear()
  })

  afterEach(async () => {
    // Clean up only keys created by this specific test
    // Track keys as we create them to avoid interfering with parallel tests
    for (const key of testKeys) {
      await redis.del(key)
    }
    testKeys.clear()
  })

  it('returns empty array when no runs exist', async () => {
    const result = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual([])
  })

  it('lists all active runs for a document', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const runs = [
      { uuid: `run-1-${testId}`, source: LogSources.API },
      { uuid: `run-2-${testId}`, source: LogSources.Playground },
      { uuid: `run-3-${testId}`, source: LogSources.Experiment },
    ]

    // Create runs
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]!
      const createResult = await createActiveRunByDocument({
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
        runUuid: run.uuid,
        queuedAt: new Date(Date.now() - i * 100), // Different timestamps
        source: run.source,
        cache: redis,
      })
      expect(createResult.ok).toBe(true)
    }

    const result = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()

    expect(value).toHaveLength(3)
    const uuids = value.map((r) => r.uuid).sort()
    expect(uuids).toEqual(runs.map((r) => r.uuid).sort())

    // Verify documentUuid and commitUuid are present
    value.forEach((run) => {
      expect(run.documentUuid).toBe(documentUuid)
      expect(run.commitUuid).toBe(commitUuid)
    })
  })

  it('sorts runs by startedAt descending, then queuedAt descending', async () => {
    const now = Date.now()
    const runs = [
      {
        uuid: 'run-1',
        queuedAt: new Date(now - 10000),
        startedAt: new Date(now - 5000),
      },
      {
        uuid: 'run-2',
        queuedAt: new Date(now - 8000),
        startedAt: new Date(now - 3000), // Most recent startedAt
      },
      {
        uuid: 'run-3',
        queuedAt: new Date(now - 2000), // Most recent queuedAt, no startedAt
      },
    ]

    // Create runs with delays to ensure different timestamps
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]!
      await createActiveRunByDocument({
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
        runUuid: run.uuid,
        queuedAt: run.queuedAt,
        source: LogSources.API,
        cache: redis,
      })

      if (run.startedAt) {
        await updateActiveRunByDocument({
          workspaceId,
          projectId,
          documentUuid,
          runUuid: run.uuid,
          updates: { startedAt: run.startedAt },
          cache: redis,
        })
      }
      // Small delay to ensure different creation times
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const result = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()

    // Verify sorting: runs with startedAt should come first, sorted by startedAt desc
    // Then runs without startedAt, sorted by queuedAt desc
    const withStartedAt = value.filter((r) => r.startedAt)
    const withoutStartedAt = value.filter((r) => !r.startedAt)

    // All runs with startedAt should come before runs without
    expect(value.indexOf(withStartedAt[0]!)).toBeLessThan(
      value.indexOf(withoutStartedAt[0]!),
    )

    // Runs with startedAt should be sorted by startedAt descending
    for (let i = 0; i < withStartedAt.length - 1; i++) {
      const current = withStartedAt[i]!.startedAt!.getTime()
      const next = withStartedAt[i + 1]!.startedAt!.getTime()
      expect(current).toBeGreaterThanOrEqual(next)
    }
  })

  it('paginates results correctly', async () => {
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    // Create 10 runs
    for (let i = 1; i <= 10; i++) {
      await createActiveRunByDocument({
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
        runUuid: `run-${i}`,
        queuedAt: new Date(Date.now() - i * 1000), // Different timestamps for sorting
        source: LogSources.API,
        cache: redis,
      })
    }

    // Get first page
    const page1 = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid,
      page: 1,
      pageSize: 5,
      cache: redis,
    })

    expect(page1.ok).toBe(true)
    if (!page1.ok) return
    expect(page1.value).toHaveLength(5)

    // Get second page
    const page2 = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid,
      page: 2,
      pageSize: 5,
      cache: redis,
    })

    expect(page2.ok).toBe(true)
    if (!page2.ok) return
    expect(page2.value).toHaveLength(5)

    if (!page1.value || !page2.value) return

    // Verify no overlap
    const page1Uuids = page1.value.map((r) => r.uuid)
    const page2Uuids = page2.value.map((r) => r.uuid)
    expect(page1Uuids.some((uuid) => page2Uuids.includes(uuid))).toBe(false)
  })

  it('uses default pagination when not specified', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    // Create more than default page size runs
    const defaultPageSize = DEFAULT_PAGINATION_SIZE ?? 25
    const count = defaultPageSize + 10 // Create more to ensure pagination is applied
    for (let i = 1; i <= count; i++) {
      await createActiveRunByDocument({
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
        runUuid: `run-pag-${testId}-${i}`,
        queuedAt: new Date(Date.now() - i * 1000),
        source: LogSources.API,
        cache: redis,
      })
    }

    const result = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()
    // Filter to only our test runs
    const testRuns = value.filter((r) =>
      r.uuid.startsWith(`run-pag-${testId}-`),
    )
    // Should return exactly the default page size (first page)
    expect(testRuns.length).toBe(defaultPageSize)
  })

  it('handles empty page gracefully', async () => {
    const result = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid,
      page: 10,
      pageSize: 10,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual([])
  })

  it('only returns runs for the specific document', async () => {
    // Create runs for different documents
    const doc1 = `doc-1-${Date.now()}`
    const doc2 = `doc-2-${Date.now()}`

    const key1 = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(workspaceId, projectId, doc1)
    const key2 = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(workspaceId, projectId, doc2)
    testKeys.add(key1)
    testKeys.add(key2)

    // Create runs for doc1
    await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid: doc1,
      commitUuid,
      runUuid: 'run-doc1-1',
      queuedAt: new Date(),
      source: LogSources.API,
      cache: redis,
    })

    await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid: doc1,
      commitUuid,
      runUuid: 'run-doc1-2',
      queuedAt: new Date(),
      source: LogSources.API,
      cache: redis,
    })

    // Create runs for doc2
    await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid: doc2,
      commitUuid,
      runUuid: 'run-doc2-1',
      queuedAt: new Date(),
      source: LogSources.API,
      cache: redis,
    })

    // List runs for doc1
    const result = await listActiveRunsByDocument({
      workspaceId,
      projectId,
      documentUuid: doc1,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const runs = result.unwrap()
    expect(runs).toHaveLength(2)
    expect(runs.every((r) => r.documentUuid === doc1)).toBe(true)
    expect(runs.every((r) => r.uuid.startsWith('run-doc1-'))).toBe(true)
  })
})
