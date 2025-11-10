import { ACTIVE_RUNS_CACHE_KEY, LogSources } from '@latitude-data/constants'
import { NotFoundError } from '../../../lib/errors'
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
import { updateActiveRun } from './update'

// Test IDs use workspace/project IDs >= 1,000,000 to identify test keys
const TEST_ID_MIN = 1_000_000

describe('updateActiveRun', () => {
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

  it('updates startedAt field', async () => {
    const runUuid = 'test-uuid-1'
    const queuedAt = new Date(Date.now() - 10000) // 10 seconds ago
    const startedAt = new Date()

    // Create run first
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source: LogSources.API,
    })

    // Update with startedAt
    const result = await updateActiveRun({
      workspaceId,
      projectId,
      runUuid,
      startedAt,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedRun = result.unwrap()

    expect(updatedRun.startedAt).toEqual(startedAt)
    expect(updatedRun.queuedAt).toEqual(queuedAt)
  })

  it('updates caption field', async () => {
    const runUuid = 'test-uuid-2'
    const queuedAt = new Date()
    const caption = 'Test caption'

    // Create run first
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source: LogSources.API,
    })

    // Update with caption
    const result = await updateActiveRun({
      workspaceId,
      projectId,
      runUuid,
      caption,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedRun = result.unwrap()

    expect(updatedRun.caption).toBe(caption)
  })

  it('updates both startedAt and caption', async () => {
    const runUuid = 'test-uuid-3'
    const queuedAt = new Date(Date.now() - 5000)
    const startedAt = new Date()
    const caption = 'Updated caption'

    // Create run first
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source: LogSources.Playground,
    })

    // Update both fields
    const result = await updateActiveRun({
      workspaceId,
      projectId,
      runUuid,
      startedAt,
      caption,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedRun = result.unwrap()

    expect(updatedRun.startedAt).toEqual(startedAt)
    expect(updatedRun.caption).toBe(caption)
    expect(updatedRun.source).toBe(LogSources.Playground) // Original source preserved
  })

  it('preserves existing fields when updating only one', async () => {
    const runUuid = 'test-uuid-4'
    const queuedAt = new Date()
    const originalStartedAt = new Date(Date.now() - 3000)
    const originalCaption = 'Original caption'
    const source = LogSources.Experiment

    // Create run
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source,
    })

    // Update with startedAt and caption
    await updateActiveRun({
      workspaceId,
      projectId,
      runUuid,
      startedAt: originalStartedAt,
      caption: originalCaption,
    })

    // Update only caption
    const result = await updateActiveRun({
      workspaceId,
      projectId,
      runUuid,
      caption: 'New caption',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updatedRun = result.unwrap()
    expect(updatedRun.caption).toBe('New caption')
    expect(updatedRun.startedAt).toEqual(originalStartedAt) // Preserved
    expect(updatedRun.source).toBe(source) // Preserved
  })

  it('returns NotFoundError when run does not exist', async () => {
    const result = await updateActiveRun({
      workspaceId,
      projectId,
      runUuid: 'non-existent-uuid',
      startedAt: new Date(),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain('Run not found')
  })

  it('refreshes TTL on update', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const runUuid = `test-uuid-ttl-${testId}`
    const queuedAt = new Date()

    // Create run
    const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const createResult = await createActiveRun({
      workspaceId,
      projectId,
      runUuid,
      queuedAt,
      source: LogSources.API,
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    // Verify run exists before update
    const beforeUpdate = await redis.hget(key, runUuid)
    expect(beforeUpdate).toBeTruthy()

    // Update run with caption (simpler than startedAt)
    const updateResult = await updateActiveRun({
      workspaceId,
      projectId,
      runUuid,
      caption: 'Updated caption',
    })

    expect(updateResult.ok).toBe(true)
    // Verify TTL was refreshed (should be close to 10800 seconds = 3 hours)
    const ttl = await redis.ttl(key)
    // TTL should be positive and close to 10800
    expect(ttl).toBeGreaterThan(0)
    if (ttl > 0) {
      expect(ttl).toBeLessThanOrEqual(10800)
      expect(ttl).toBeGreaterThan(10700) // Allow some margin
    }
  })
})
