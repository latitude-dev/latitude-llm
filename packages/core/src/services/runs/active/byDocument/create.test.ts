import {
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
  LogSources,
} from '@latitude-data/constants'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../../cache'
import { cache } from '../../../../cache'
import { createActiveRunByDocument } from './create'

describe('createActiveRunByDocument', () => {
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

  it('creates an active run in cache', async () => {
    const runUuid = 'test-uuid-1'
    const queuedAt = new Date()
    const source = LogSources.API

    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    const result = await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
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
    expect(result.value.documentUuid).toBe(documentUuid)
    expect(result.value.commitUuid).toBe(commitUuid)
  })

  it('stores run in Redis hash', async () => {
    const runUuid = 'test-uuid-2'
    const queuedAt = new Date()
    const source = LogSources.Playground

    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    const result = await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
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
    expect(storedRun.documentUuid).toBe(documentUuid)
    expect(storedRun.commitUuid).toBe(commitUuid)
  })

  it('sets TTL on the hash key', async () => {
    const runUuid = 'test-uuid-3'
    const queuedAt = new Date()
    const source = LogSources.API

    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    const result = await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
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

    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    for (const source of sources) {
      const runUuid = `test-uuid-${source}`
      const queuedAt = new Date()

      const result = await createActiveRunByDocument({
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
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

  it('handles multiple runs for same workspace/project/document', async () => {
    const runs = [
      { uuid: 'run-1', source: LogSources.API },
      { uuid: 'run-2', source: LogSources.Playground },
      { uuid: 'run-3', source: LogSources.Experiment },
    ]

    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    for (const run of runs) {
      const result = await createActiveRunByDocument({
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
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

  it('handles different workspaces, projects, and documents', async () => {
    // Use unique IDs to avoid conflicts with other tests
    const baseWsId = testCounter++
    const scenarios = [
      {
        workspaceId: baseWsId,
        projectId: baseWsId + 10,
        documentUuid: `doc-${baseWsId}`,
      },
      {
        workspaceId: baseWsId,
        projectId: baseWsId + 20,
        documentUuid: `doc-${baseWsId + 1}`,
      },
      {
        workspaceId: baseWsId + 1,
        projectId: baseWsId + 10,
        documentUuid: `doc-${baseWsId + 2}`,
      },
    ]

    // Track keys before creating runs
    for (const {
      workspaceId: wsId,
      projectId: projId,
      documentUuid: docUuid,
    } of scenarios) {
      const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(wsId, projId, docUuid)
      testKeys.add(key)
    }

    for (const {
      workspaceId: wsId,
      projectId: projId,
      documentUuid: docUuid,
    } of scenarios) {
      const result = await createActiveRunByDocument({
        workspaceId: wsId,
        projectId: projId,
        documentUuid: docUuid,
        commitUuid: `commit-${wsId}-${projId}-${docUuid}`,
        runUuid: `run-${wsId}-${projId}-${docUuid}`,
        queuedAt: new Date(),
        source: LogSources.API,
        cache: redis,
      })

      expect(result.ok).toBe(true)
    }

    // Verify each has its own hash with exactly one run
    for (const {
      workspaceId: wsId,
      projectId: projId,
      documentUuid: docUuid,
    } of scenarios) {
      const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(wsId, projId, docUuid)
      testKeys.add(key)
      const hashData = await redis.hgetall(key)
      const runKeys = Object.keys(hashData).filter((k) => k.startsWith('run-'))
      expect(runKeys).toHaveLength(1)
    }
  })
})
