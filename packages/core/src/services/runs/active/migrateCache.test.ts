import {
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
  LogSources,
} from '@latitude-data/constants'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { migrateActiveRunsCache } from './migrateCache'
import { listCachedRuns } from './listCached'
import { createActiveRun } from './create'

describe('migrateActiveRunsCache', () => {
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

  it('migrates from old STRING format (array) to new HASH format', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Simulate old format: array of runs as JSON string
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

    // Set as STRING (old format)
    await redis.set(key, JSON.stringify(oldRuns))

    // Verify it's a string
    const keyType = await redis.type(key)
    expect(keyType).toBe('string')

    // Run migration
    await migrateActiveRunsCache(workspaceId, projectId, redis)

    // Verify it's now a hash
    const newKeyType = await redis.type(key)
    expect(newKeyType).toBe('hash')

    // Verify data is preserved
    const result = await listCachedRuns(workspaceId, projectId, redis)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const runs = result.unwrap()
    expect(runs).toHaveLength(2)
    expect(runs.find((r) => r.uuid === 'run-1')).toBeDefined()
    expect(runs.find((r) => r.uuid === 'run-2')).toBeDefined()
  })

  it('migrates from old STRING format (object) to new HASH format', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Simulate old format: object with run UUIDs as keys
    const oldRuns = {
      'run-1': {
        uuid: 'run-1',
        queuedAt: new Date().toISOString(),
        source: LogSources.API,
      },
      'run-2': {
        uuid: 'run-2',
        queuedAt: new Date().toISOString(),
        source: LogSources.Playground,
      },
    }

    await redis.set(key, JSON.stringify(oldRuns))
    await migrateActiveRunsCache(workspaceId, projectId, redis)

    const result = await listCachedRuns(workspaceId, projectId, redis)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toHaveLength(2)
  })

  it('handles empty string gracefully', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    await redis.set(key, '')
    await migrateActiveRunsCache(workspaceId, projectId, redis)

    // Key should be deleted
    const exists = await redis.exists(key)
    expect(exists).toBe(0)
  })

  it('handles invalid JSON gracefully', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    await redis.set(key, 'invalid json')
    await migrateActiveRunsCache(workspaceId, projectId, redis)

    // Key should be deleted
    const exists = await redis.exists(key)
    expect(exists).toBe(0)
  })

  it('does nothing if key is already a hash', async () => {
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Create in new format
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid: 'run-1',
      queuedAt: new Date(),
      source: LogSources.API,
      cache: redis,
    })

    // Verify it's a hash
    const keyType = await redis.type(key)
    expect(keyType).toBe('hash')

    // Get the value before migration
    const before = await listCachedRuns(workspaceId, projectId, redis)
    expect(before.ok).toBe(true)

    // Run migration (should be no-op)
    await migrateActiveRunsCache(workspaceId, projectId, redis)

    // Verify data is unchanged
    const after = await listCachedRuns(workspaceId, projectId, redis)
    expect(after.ok).toBe(true)
    if (!before.ok || !after.ok) return

    expect(after.value).toEqual(before.value)
  })
})
