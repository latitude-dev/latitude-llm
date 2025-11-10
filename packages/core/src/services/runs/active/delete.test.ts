import { ACTIVE_RUNS_CACHE_KEY, LogSources } from '@latitude-data/constants'
import { NotFoundError } from '../../../lib/errors'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveRun } from './create'
import { deleteActiveRun } from './delete'
import { updateActiveRun } from './update'

describe('deleteActiveRun', () => {
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

  it('deletes an active run from cache', async () => {
    const runUuid = 'test-uuid-1'
    const queuedAt = new Date()
    const source = LogSources.API

    // Create run first
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source,
      cache: redis,
    })

    // Delete run
    const result = await deleteActiveRun({
      workspaceId,
      projectId,
      runUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const deletedRun = result.unwrap()

    expect(deletedRun.uuid).toBe(runUuid)
    expect(deletedRun.source).toBe(source)

    // Verify it's removed from Redis
    const verifyKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    expect(hashData).not.toHaveProperty(runUuid)
  })

  it('returns the deleted run data', async () => {
    const runUuid = 'test-uuid-2'
    const queuedAt = new Date()
    const startedAt = new Date()
    const source = LogSources.Playground

    // Create run
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source,
      cache: redis,
    })

    // Update with startedAt
    await updateActiveRun({
      workspaceId,
      projectId,
      runUuid,
      startedAt,
      cache: redis,
    })

    // Delete and verify returned data
    const result = await deleteActiveRun({
      workspaceId,
      projectId,
      runUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const deletedRun = result.unwrap()

    expect(deletedRun.uuid).toBe(runUuid)
    expect(deletedRun.queuedAt).toEqual(queuedAt)
    expect(deletedRun.startedAt).toEqual(startedAt)
    expect(deletedRun.source).toBe(source)
  })

  it('returns NotFoundError when run does not exist', async () => {
    const result = await deleteActiveRun({
      workspaceId,
      projectId,
      runUuid: 'non-existent-uuid',
      cache: redis,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain('Run not found')
  })

  it('handles deleting from hash with multiple runs', async () => {
    // Use unique run UUIDs to avoid conflicts
    const testId = Date.now()
    const runs = [
      { uuid: `run-1-${testId}`, source: LogSources.API },
      { uuid: `run-2-${testId}`, source: LogSources.Playground },
      { uuid: `run-3-${testId}`, source: LogSources.Experiment },
    ]

    // Create all runs
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

    // Delete one run
    const result = await deleteActiveRun({
      workspaceId,
      projectId,
      runUuid: `run-2-${testId}`,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      console.error('Delete failed:', result.error)
      return
    }

    // Verify only that run was deleted
    const verifyKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    expect(hashData).toHaveProperty(`run-1-${testId}`)
    expect(hashData).not.toHaveProperty(`run-2-${testId}`)
    expect(hashData).toHaveProperty(`run-3-${testId}`)
  })

  it('handles deleting all runs from a workspace/project', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const runUuids = [`run-1-${testId}`, `run-2-${testId}`, `run-3-${testId}`]

    // Create runs
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const uuid of runUuids) {
      const createResult = await createActiveRun({
        workspaceId,
        projectId,
        runUuid: uuid,
        queuedAt: new Date(),
        source: LogSources.API,
        cache: redis,
      })
      expect(createResult.ok).toBe(true)
    }

    // Delete all runs
    for (const uuid of runUuids) {
      const result = await deleteActiveRun({
        workspaceId,
        projectId,
        runUuid: uuid,
        cache: redis,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) {
        console.error('Delete failed for:', uuid, result.error)
      }
    }

    // Verify our test runs are deleted (hash might have other runs from other tests)
    const verifyKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    for (const uuid of runUuids) {
      expect(hashData).not.toHaveProperty(uuid)
    }
  })
})
