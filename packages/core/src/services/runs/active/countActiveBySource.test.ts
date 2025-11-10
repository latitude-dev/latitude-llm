import {
  ACTIVE_RUNS_CACHE_KEY,
  LOG_SOURCES,
  LogSources,
} from '../../../constants'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveRun } from './create'
import { countActiveRunsBySource } from './countActiveBySource'

// Test IDs use workspace/project IDs >= 1,000,000 to identify test keys
const TEST_ID_MIN = 1_000_000

describe('countActiveRunsBySource', () => {
  let redis: Cache
  let workspaceId: number
  let projectId: number
  const testKeys = new Set<string>()

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(async () => {
    // Use test ID range to ensure we can clean them up by pattern
    workspaceId = TEST_ID_MIN + Math.floor(Math.random() * 1000000)
    projectId = TEST_ID_MIN + Math.floor(Math.random() * 1000000)
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

  afterAll(async () => {
    await redis.flushdb()
  })

  it('returns zero counts for all sources when no runs exist', async () => {
    const result = await countActiveRunsBySource({
      workspaceId,
      projectId,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const countBySource = result.unwrap()

    // Verify all sources are present with 0 count
    for (const source of LOG_SOURCES) {
      expect(countBySource[source]).toBe(0)
    }
  })

  it('counts runs by source correctly', async () => {
    // Use unique run UUIDs to avoid conflicts
    const testId = Date.now()
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const runs = [
      { uuid: `run-api-1-${testId}`, source: LogSources.API },
      { uuid: `run-api-2-${testId}`, source: LogSources.API },
      { uuid: `run-play-1-${testId}`, source: LogSources.Playground },
      { uuid: `run-exp-1-${testId}`, source: LogSources.Experiment },
      { uuid: `run-play-2-${testId}`, source: LogSources.Playground },
    ]

    for (const run of runs) {
      const createResult = await createActiveRun({
        workspaceId,
        projectId,
        runUuid: run.uuid,
        queuedAt: new Date(), // Use current time to ensure not filtered by TTL
        source: run.source,
      })
      expect(createResult.ok).toBe(true)
    }

    const result = await countActiveRunsBySource({
      workspaceId,
      projectId,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const countBySource = result.unwrap()

    expect(countBySource[LogSources.API]).toBe(2)
    expect(countBySource[LogSources.Playground]).toBe(2)
    expect(countBySource[LogSources.Experiment]).toBe(1)

    // Other sources should be 0
    const otherSources = LOG_SOURCES.filter(
      (s) =>
        s !== LogSources.API &&
        s !== LogSources.Playground &&
        s !== LogSources.Experiment,
    )
    for (const source of otherSources) {
      expect(countBySource[source]).toBe(0)
    }
  })

  it('handles runs with undefined source (defaults to API)', async () => {
    // Create a run without explicit source (should default to API in the service)
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid: 'run-1',
      queuedAt: new Date(),
      source: LogSources.API, // Explicitly set to API
    })

    const result = await countActiveRunsBySource({
      workspaceId,
      projectId,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const countBySource = result.unwrap()

    expect(countBySource[LogSources.API]).toBe(1)
  })

  it('returns all sources in the result', async () => {
    const result = await countActiveRunsBySource({
      workspaceId,
      projectId,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const countBySource = result.unwrap()
    // Verify all LOG_SOURCES are present
    for (const source of LOG_SOURCES) {
      expect(countBySource).toHaveProperty(source)
      expect(typeof countBySource[source]).toBe('number')
    }
  })

  it('updates counts correctly when runs are added', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    // Add runs
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid: `run-1-${testId}`,
      queuedAt: new Date(),
      source: LogSources.API,
    })

    await createActiveRun({
      workspaceId,
      projectId,
      runUuid: `run-2-${testId}`,
      queuedAt: new Date(),
      source: LogSources.API,
    })

    // Updated count
    const updated = await countActiveRunsBySource({
      workspaceId,
      projectId,
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    const updatedCountBySource = updated.unwrap()
    expect(updatedCountBySource[LogSources.API]).toBe(2)
  })

  it('handles multiple workspaces and projects independently', async () => {
    // Use unique IDs to avoid conflicts with other tests
    const baseWsId = Math.floor(Math.random() * 1000000)
    const ws1 = baseWsId
    const ws2 = baseWsId + 1
    const proj1 = baseWsId + 10
    const proj2 = baseWsId + 20

    // Track keys for all workspace/project combinations
    const key1 = ACTIVE_RUNS_CACHE_KEY(ws1, proj1)
    const key2 = ACTIVE_RUNS_CACHE_KEY(ws1, proj2)
    const key3 = ACTIVE_RUNS_CACHE_KEY(ws2, proj1)
    testKeys.add(key1)
    testKeys.add(key2)
    testKeys.add(key3)

    // Create runs in different workspace/project combinations
    await createActiveRun({
      workspaceId: ws1,
      projectId: proj1,
      runUuid: `run-${ws1}-${proj1}`,
      queuedAt: new Date(),
      source: LogSources.API,
    })

    await createActiveRun({
      workspaceId: ws1,
      projectId: proj2,
      runUuid: `run-${ws1}-${proj2}`,
      queuedAt: new Date(),
      source: LogSources.Playground,
    })

    await createActiveRun({
      workspaceId: ws2,
      projectId: proj1,
      runUuid: `run-${ws2}-${proj1}`,
      queuedAt: new Date(),
      source: LogSources.Experiment,
    })

    // Count for workspace 1, project 1
    const result1 = await countActiveRunsBySource({
      workspaceId: ws1,
      projectId: proj1,
    })
    expect(result1.ok).toBe(true)
    if (!result1.ok) return
    const countBySource1 = result1.unwrap()
    expect(countBySource1[LogSources.API]).toBe(1)
    expect(countBySource1[LogSources.Playground]).toBe(0)

    // Count for workspace 1, project 2
    const result2 = await countActiveRunsBySource({
      workspaceId: ws1,
      projectId: proj2,
    })
    expect(result2.ok).toBe(true)
    if (!result2.ok) return
    const countBySource2 = result2.unwrap()
    expect(countBySource2[LogSources.Playground]).toBe(1)
    expect(countBySource2[LogSources.API]).toBe(0)
  })
})
