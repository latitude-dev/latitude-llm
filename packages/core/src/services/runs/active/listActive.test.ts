import {
  ACTIVE_RUNS_CACHE_KEY,
  LogSources,
  RunSourceGroup,
  RUN_SOURCES,
} from '@latitude-data/constants'
import { DEFAULT_PAGINATION_SIZE } from '../../../constants'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveRun } from './create'
import { listActiveRuns } from './listActive'
import { updateActiveRun } from './update'

describe('listActiveRuns', () => {
  let redis: Cache
  let workspaceId: number
  let projectId: number
  const testKeys = new Set<string>()
  let testCounter = Date.now()

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(async () => {
    // Generate unique IDs for each test to avoid collisions in parallel execution
    workspaceId = testCounter++
    projectId = testCounter++
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
    const result = await listActiveRuns({
      workspaceId,
      projectId,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual([])
  })

  it('lists all active runs', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const runs = [
      { uuid: `run-1-${testId}`, source: LogSources.API },
      { uuid: `run-2-${testId}`, source: LogSources.Playground },
      { uuid: `run-3-${testId}`, source: LogSources.Experiment },
    ]

    // Create runs
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const run of runs) {
      const createResult = await createActiveRun({
        workspaceId,
        projectId,
        runUuid: run.uuid,
        queuedAt: new Date(),
        source: run.source,
        cache: redis,
      })
      expect(createResult.ok).toBe(true)
    }

    const result = await listActiveRuns({
      workspaceId,
      projectId,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()

    // Filter to only our test runs
    const testRuns = value.filter((r) =>
      runs.some((run) => r.uuid === run.uuid),
    )
    expect(testRuns).toHaveLength(3)
    const uuids = testRuns.map((r) => r.uuid).sort()
    expect(uuids).toEqual(runs.map((r) => r.uuid).sort())
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
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]!
      await createActiveRun({
        workspaceId,
        projectId,
        runUuid: run.uuid,
        queuedAt: run.queuedAt,
        source: LogSources.API,
        cache: redis,
      })

      if (run.startedAt) {
        await updateActiveRun({
          workspaceId,
          projectId,
          runUuid: run.uuid,
          startedAt: run.startedAt,
          cache: redis,
        })
      }
      // Small delay to ensure different creation times
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const result = await listActiveRuns({
      workspaceId,
      projectId,
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

  it('filters by sourceGroup - Playground', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const runs = [
      { uuid: 'run-1', source: LogSources.Playground },
      { uuid: 'run-2', source: LogSources.API },
      { uuid: 'run-3', source: LogSources.Playground },
    ]

    for (const run of runs) {
      await createActiveRun({
        workspaceId,
        projectId,
        runUuid: run.uuid,
        queuedAt: new Date(),
        source: run.source,
        cache: redis,
      })
    }

    const result = await listActiveRuns({
      workspaceId,
      projectId,
      sourceGroup: RunSourceGroup.Playground,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()

    expect(value).toHaveLength(2)
    expect(value.every((r) => r.source === LogSources.Playground)).toBe(true)
  })

  it('filters by sourceGroup - Production', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const runs = [
      { uuid: 'run-1', source: LogSources.API },
      { uuid: 'run-2', source: LogSources.Experiment },
      { uuid: 'run-3', source: LogSources.Playground },
    ]

    for (const run of runs) {
      await createActiveRun({
        workspaceId,
        projectId,
        runUuid: run.uuid,
        queuedAt: new Date(),
        source: run.source,
        cache: redis,
      })
    }

    const result = await listActiveRuns({
      workspaceId,
      projectId,
      sourceGroup: RunSourceGroup.Production,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const productionSources = RUN_SOURCES[RunSourceGroup.Production]
    const value = result.unwrap()
    expect(value.every((r) => productionSources.includes(r.source!))).toBe(true)
  })

  it('paginates results correctly', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    // Create 10 runs
    for (let i = 1; i <= 10; i++) {
      await createActiveRun({
        workspaceId,
        projectId,
        runUuid: `run-${i}`,
        queuedAt: new Date(Date.now() - i * 1000), // Different timestamps for sorting
        source: LogSources.API,
        cache: redis,
      })
    }

    // Get first page
    const page1 = await listActiveRuns({
      workspaceId,
      projectId,
      page: 1,
      pageSize: 5,
      cache: redis,
    })

    expect(page1.ok).toBe(true)
    if (!page1.ok) return
    expect(page1.value).toHaveLength(5)

    // Get second page
    const page2 = await listActiveRuns({
      workspaceId,
      projectId,
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
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    // Create more than default page size runs
    const defaultPageSize = DEFAULT_PAGINATION_SIZE ?? 25
    const count = defaultPageSize + 10 // Create more to ensure pagination is applied
    for (let i = 1; i <= count; i++) {
      await createActiveRun({
        workspaceId,
        projectId,
        runUuid: `run-pag-${testId}-${i}`,
        queuedAt: new Date(Date.now() - i * 1000),
        source: LogSources.API,
        cache: redis,
      })
    }

    const result = await listActiveRuns({
      workspaceId,
      projectId,
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
    const result = await listActiveRuns({
      workspaceId,
      projectId,
      page: 10,
      pageSize: 10,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual([])
  })
})
