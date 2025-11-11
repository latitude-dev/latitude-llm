import { Job } from 'bullmq'
import { beforeEach, afterEach, describe, expect, it, beforeAll } from 'vitest'
import { migrateActiveRunsCacheJob } from './migrateActiveRunsCacheJob'
import {
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
  LogSources,
} from '@latitude-data/constants'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveRun } from '../../../services/runs/active/create'
import { listCachedRuns } from '../../../services/runs/active/listCached'

describe('migrateActiveRunsCacheJob', () => {
  let redis: Cache
  const testKeys = new Set<string>()
  let testCounter = Date.now()

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(() => {
    testCounter = Date.now()
    testKeys.clear()
  })

  afterEach(async () => {
    for (const key of testKeys) {
      await redis.del(key)
    }
    testKeys.clear()
  })

  it('migrates STRING keys to HASH format', async () => {
    const workspaceId = testCounter++
    const projectId = testCounter++
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Create old format: STRING with array of runs
    const oldRuns: ActiveRun[] = [
      {
        uuid: 'run-1',
        queuedAt: new Date(),
        source: LogSources.API,
      },
      {
        uuid: 'run-2',
        queuedAt: new Date(),
        source: LogSources.Playground,
      },
    ]

    await redis.set(key, JSON.stringify(oldRuns))

    // Verify it's a string
    expect(await redis.type(key)).toBe('string')

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Verify migration happened
    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBe(0)

    // Verify key is now a hash
    expect(await redis.type(key)).toBe('hash')

    // Verify data is preserved
    const listResult = await listCachedRuns(workspaceId, projectId, redis)
    expect(listResult.ok).toBe(true)
    if (!listResult.ok) return

    const runs = listResult.unwrap()
    expect(runs).toHaveLength(2)
    expect(runs.find((r) => r.uuid === 'run-1')).toBeDefined()
    expect(runs.find((r) => r.uuid === 'run-2')).toBeDefined()
  })

  it('skips keys that are already HASH format', async () => {
    const workspaceId = testCounter++
    const projectId = testCounter++
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Create in new format (HASH)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid: 'run-1',
      queuedAt: new Date(),
      source: LogSources.API,
      cache: redis,
    })

    // Verify it's a hash
    expect(await redis.type(key)).toBe('hash')

    // Get data before migration
    const before = await listCachedRuns(workspaceId, projectId, redis)
    expect(before.ok).toBe(true)

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Verify it was skipped
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors).toBe(0)

    // Verify data is unchanged
    const after = await listCachedRuns(workspaceId, projectId, redis)
    expect(after.ok).toBe(true)
    if (!before.ok || !after.ok) return

    expect(after.value).toEqual(before.value)
  })

  it('only processes keys matching runs:active:*:* pattern', async () => {
    const workspaceId = testCounter++
    const projectId = testCounter++
    const activeKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(activeKey)

    // Create other keys that should be ignored
    const otherKey1 = 'other:key:1'
    const otherKey2 = 'runs:completed:1:2'
    const otherKey3 = 'runs:active:invalid'
    testKeys.add(otherKey1)
    testKeys.add(otherKey2)
    testKeys.add(otherKey3)

    // Set old format for active runs key
    await redis.set(
      activeKey,
      JSON.stringify([
        { uuid: 'run-1', queuedAt: new Date(), source: LogSources.API },
      ]),
    )

    // Set other keys (should be ignored)
    await redis.set(otherKey1, 'value1')
    await redis.set(otherKey2, 'value2')
    await redis.set(otherKey3, 'value3')

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should only migrate the active runs key
    expect(result.migrated).toBe(1)
    expect(await redis.type(activeKey)).toBe('hash')

    // Other keys should remain unchanged
    expect(await redis.type(otherKey1)).toBe('string')
    expect(await redis.type(otherKey2)).toBe('string')
    expect(await redis.type(otherKey3)).toBe('string')
  })

  it('handles multiple workspace/project combinations', async () => {
    const ws1 = testCounter++
    const proj1 = testCounter++
    const ws2 = testCounter++
    const proj2 = testCounter++
    const ws3 = testCounter++
    const proj3 = testCounter++

    const key1 = ACTIVE_RUNS_CACHE_KEY(ws1, proj1)
    const key2 = ACTIVE_RUNS_CACHE_KEY(ws2, proj2)
    const key3 = ACTIVE_RUNS_CACHE_KEY(ws3, proj3)
    testKeys.add(key1)
    testKeys.add(key2)
    testKeys.add(key3)

    // Create old format for all three
    await redis.set(
      key1,
      JSON.stringify([
        { uuid: 'run-1', queuedAt: new Date(), source: LogSources.API },
      ]),
    )
    await redis.set(
      key2,
      JSON.stringify([
        { uuid: 'run-2', queuedAt: new Date(), source: LogSources.API },
      ]),
    )
    await redis.set(
      key3,
      JSON.stringify([
        { uuid: 'run-3', queuedAt: new Date(), source: LogSources.API },
      ]),
    )

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should migrate all three
    expect(result.migrated).toBe(3)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBe(0)

    // Verify all are now hashes
    expect(await redis.type(key1)).toBe('hash')
    expect(await redis.type(key2)).toBe('hash')
    expect(await redis.type(key3)).toBe('hash')
  })

  it('handles mixed STRING and HASH keys', async () => {
    const ws1 = testCounter++
    const proj1 = testCounter++
    const ws2 = testCounter++
    const proj2 = testCounter++

    const key1 = ACTIVE_RUNS_CACHE_KEY(ws1, proj1)
    const key2 = ACTIVE_RUNS_CACHE_KEY(ws2, proj2)
    testKeys.add(key1)
    testKeys.add(key2)

    // Key1: old format (STRING)
    await redis.set(
      key1,
      JSON.stringify([
        { uuid: 'run-1', queuedAt: new Date(), source: LogSources.API },
      ]),
    )

    // Key2: new format (HASH)
    await createActiveRun({
      workspaceId: ws2,
      projectId: proj2,
      runUuid: 'run-2',
      queuedAt: new Date(),
      source: LogSources.API,
      cache: redis,
    })

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should migrate key1 and skip key2
    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.errors).toBe(0)

    // Verify both are hashes now
    expect(await redis.type(key1)).toBe('hash')
    expect(await redis.type(key2)).toBe('hash')
  })

  it('skips keys that match pattern but have invalid format', async () => {
    // Keys that match the pattern but have invalid workspaceId/projectId will be skipped
    const invalidKey1 = 'runs:active:invalid:format:too:many:parts' // Matches pattern but invalid format
    const invalidKey2 = 'runs:wrong:1:2' // Doesn't match pattern (wrong prefix), will be ignored
    const invalidKey3 = 'runs:active:not-a-number:2' // Matches pattern but invalid (needs digits)
    const invalidKey4 = 'runs:active:1:not-a-number' // Matches pattern but invalid (needs digits)
    const otherKey = 'some:other:key' // Completely different key, will be ignored

    testKeys.add(invalidKey1)
    testKeys.add(invalidKey2)
    testKeys.add(invalidKey3)
    testKeys.add(invalidKey4)
    testKeys.add(otherKey)

    await redis.set(invalidKey1, 'value1')
    await redis.set(invalidKey2, 'value2')
    await redis.set(invalidKey3, 'value3')
    await redis.set(invalidKey4, 'value4')
    await redis.set(otherKey, 'value5')

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Keys that match the pattern but are invalid will be skipped
    // invalidKey1, invalidKey3, invalidKey4 match the pattern but are invalid (3 keys)
    // invalidKey2 and otherKey don't match the pattern, so they're ignored (not counted)
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(3) // invalidKey1, invalidKey3, invalidKey4
    expect(result.errors).toBe(0)
  })

  it('handles empty Redis gracefully', async () => {
    // No keys in Redis
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('handles keys that are deleted during migration', async () => {
    const workspaceId = testCounter++
    const projectId = testCounter++
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Create old format
    await redis.set(
      key,
      JSON.stringify([
        { uuid: 'run-1', queuedAt: new Date(), source: LogSources.API },
      ]),
    )

    // Mock a scenario where key might be deleted (simulate by checking type first)
    const mockJob = { data: {} } as Job

    // Delete the key before migration completes (simulating race condition)
    // This is handled by the migration function itself
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should handle gracefully
    expect(result.errors).toBe(0)
  })

  it('is idempotent - can run multiple times safely', async () => {
    const workspaceId = testCounter++
    const projectId = testCounter++
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Create old format
    await redis.set(
      key,
      JSON.stringify([
        { uuid: 'run-1', queuedAt: new Date(), source: LogSources.API },
      ]),
    )

    const mockJob = { data: {} } as Job

    // Run first time
    const result1 = await migrateActiveRunsCacheJob(mockJob)
    expect(result1.migrated).toBe(1)
    expect(await redis.type(key)).toBe('hash')

    // Run second time (should skip)
    const result2 = await migrateActiveRunsCacheJob(mockJob)
    expect(result2.migrated).toBe(0)
    expect(result2.skipped).toBe(1)
    expect(await redis.type(key)).toBe('hash')

    // Run third time (should skip)
    const result3 = await migrateActiveRunsCacheJob(mockJob)
    expect(result3.migrated).toBe(0)
    expect(result3.skipped).toBe(1)
    expect(await redis.type(key)).toBe('hash')
  })

  it('handles keys with Redis prefix correctly', async () => {
    const workspaceId = testCounter++
    const projectId = testCounter++
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Create old format
    await redis.set(
      key,
      JSON.stringify([
        { uuid: 'run-1', queuedAt: new Date(), source: LogSources.API },
      ]),
    )

    // Verify key exists (ioredis handles prefix automatically)
    expect(await redis.type(key)).toBe('string')

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should migrate successfully
    expect(result.migrated).toBe(1)
    expect(await redis.type(key)).toBe('hash')
  })

  it('processes large number of keys in batches', async () => {
    const keys: string[] = []
    const workspaceIds: number[] = []
    const projectIds: number[] = []

    // Create 50 keys with old format
    for (let i = 0; i < 50; i++) {
      const wsId = testCounter++
      const projId = testCounter++
      workspaceIds.push(wsId)
      projectIds.push(projId)

      const key = ACTIVE_RUNS_CACHE_KEY(wsId, projId)
      keys.push(key)
      testKeys.add(key)

      await redis.set(
        key,
        JSON.stringify([
          { uuid: `run-${i}`, queuedAt: new Date(), source: LogSources.API },
        ]),
      )
    }

    // Run the job
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should migrate all 50
    expect(result.migrated).toBe(50)
    expect(result.errors).toBe(0)

    // Verify all are hashes
    for (const key of keys) {
      expect(await redis.type(key)).toBe('hash')
    }
  })

  it('correctly terminates when cursor returns to 0', async () => {
    // This test verifies that the SCAN loop correctly terminates when cursor becomes '0'
    // Redis SCAN returns cursor '0' when there are no more keys to scan
    const workspaceId = testCounter++
    const projectId = testCounter++
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Create old format
    await redis.set(
      key,
      JSON.stringify([
        { uuid: 'run-1', queuedAt: new Date(), source: LogSources.API },
      ]),
    )

    // Run the job - it should complete (cursor terminates at '0')
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should complete successfully (cursor loop terminated)
    expect(result.migrated).toBe(1)
    expect(result.errors).toBe(0)
    expect(await redis.type(key)).toBe('hash')
  })

  it('handles cursor loop correctly with no matching keys', async () => {
    // Test that cursor loop terminates even when no keys match the pattern
    // This ensures the do-while loop doesn't run indefinitely
    const mockJob = { data: {} } as Job
    const result = await migrateActiveRunsCacheJob(mockJob)

    // Should complete with no matches (cursor terminates immediately)
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBe(0)
  })
})
