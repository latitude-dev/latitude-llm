import { ACTIVE_RUNS_CACHE_KEY, LogSources } from '@latitude-data/constants'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveRun } from './create'

describe('createActiveRun', () => {
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

  it('creates an active run in cache', async () => {
    const runUuid = 'test-uuid-1'
    const queuedAt = new Date()
    const source = LogSources.API

    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const result = await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.value) return

    expect(result.value.uuid).toBe(runUuid)
    expect(result.value.queuedAt).toEqual(queuedAt)
    expect(result.value.source).toBe(source)
  })

  it('stores run in Redis hash', async () => {
    const runUuid = 'test-uuid-2'
    const queuedAt = new Date()
    const source = LogSources.Playground

    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const result = await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Verify it's stored in Redis
    const hashData = await redis.hgetall(key)
    expect(hashData).toHaveProperty(runUuid)

    const storedRun = JSON.parse(hashData[runUuid]!)
    expect(storedRun.uuid).toBe(runUuid)
    expect(storedRun.source).toBe(source)
  })

  it('sets TTL on the hash key', async () => {
    const runUuid = 'test-uuid-3'
    const queuedAt = new Date()
    const source = LogSources.API

    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const result = await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Verify TTL is set (should be around 3 hours = 10800 seconds)
    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(10700) // Allow some margin for execution time
    expect(ttl).toBeLessThanOrEqual(10800)
  })

  it('handles different log sources', async () => {
    const sources = [
      LogSources.API,
      LogSources.Playground,
      LogSources.Experiment,
    ]

    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const source of sources) {
      const runUuid = `test-uuid-${source}`
      const queuedAt = new Date()

      const result = await createActiveRun({
        workspaceId,
        projectId,
        runUuid,
        queuedAt,
        source,
        cache: redis,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) continue

      const createdRun = result.unwrap()
      expect(createdRun.source).toBe(source)
    }
  })

  it('handles multiple runs for same workspace/project', async () => {
    const runs = [
      { uuid: 'run-1', source: LogSources.API },
      { uuid: 'run-2', source: LogSources.Playground },
      { uuid: 'run-3', source: LogSources.Experiment },
    ]

    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const run of runs) {
      const result = await createActiveRun({
        workspaceId,
        projectId,
        runUuid: run.uuid,
        queuedAt: new Date(),
        source: run.source,
        cache: redis,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
    }

    // Verify all runs are stored
    const hashData = await redis.hgetall(key)
    expect(Object.keys(hashData)).toHaveLength(3)
  })

  it('handles different workspaces and projects', async () => {
    // Use unique IDs to avoid conflicts with other tests
    const baseWsId = testCounter++
    const workspaces = [
      { workspaceId: baseWsId, projectId: baseWsId + 10 },
      { workspaceId: baseWsId, projectId: baseWsId + 20 },
      { workspaceId: baseWsId + 1, projectId: baseWsId + 10 },
    ]

    // Track keys before creating runs
    for (const { workspaceId: wsId, projectId: projId } of workspaces) {
      const key = ACTIVE_RUNS_CACHE_KEY(wsId, projId)
      testKeys.add(key)
    }

    for (const { workspaceId: wsId, projectId: projId } of workspaces) {
      const result = await createActiveRun({
        workspaceId: wsId,
        projectId: projId,
        runUuid: `run-${wsId}-${projId}`,
        queuedAt: new Date(),
        source: LogSources.API,
        cache: redis,
      })

      expect(result.ok).toBe(true)
    }

    // Verify each has its own hash with exactly one run
    for (const { workspaceId: wsId, projectId: projId } of workspaces) {
      const key = ACTIVE_RUNS_CACHE_KEY(wsId, projId)
      testKeys.add(key)
      const hashData = await redis.hgetall(key)
      const runKeys = Object.keys(hashData).filter((k) => k.startsWith('run-'))
      expect(runKeys).toHaveLength(1)
    }
  })
})
