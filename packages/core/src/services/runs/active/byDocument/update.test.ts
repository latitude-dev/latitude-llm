import {
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
  LogSources,
} from '@latitude-data/constants'
import { NotFoundError } from '../../../../lib/errors'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../../cache'
import { cache } from '../../../../cache'
import { createActiveRunByDocument } from './create'
import { updateActiveRunByDocument } from './update'

describe('updateActiveRunByDocument', () => {
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

  it('updates startedAt field', async () => {
    const runUuid = 'test-uuid-1'
    const queuedAt = new Date(Date.now() - 10000) // 10 seconds ago

    // Create run first
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    const createResult = await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      queuedAt,
      source: LogSources.API,
      cache: redis,
    })

    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    // Update with startedAt
    const startedAt = new Date()
    const result = await updateActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      runUuid,
      updates: { startedAt },
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedRun = result.unwrap()

    expect(updatedRun.startedAt).toBeSameTimeIgnoringNanos(startedAt)
    expect(updatedRun.queuedAt).toBeSameTimeIgnoringNanos(queuedAt)
    expect(updatedRun.documentUuid).toBe(documentUuid)
    expect(updatedRun.commitUuid).toBe(commitUuid)
  })

  it('updates caption field', async () => {
    const runUuid = 'test-uuid-2'
    const queuedAt = new Date()
    const caption = 'Test caption'

    // Create run first
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      queuedAt,
      source: LogSources.API,
      cache: redis,
    })

    // Update with caption
    const result = await updateActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      runUuid,
      updates: { caption },
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedRun = result.unwrap()

    expect(updatedRun.caption).toBe(caption)
    expect(updatedRun.documentUuid).toBe(documentUuid)
    expect(updatedRun.commitUuid).toBe(commitUuid)
  })

  it('updates both startedAt and caption', async () => {
    const runUuid = 'test-uuid-3'
    const queuedAt = new Date(Date.now() - 5000)
    const startedAt = new Date()
    const caption = 'Updated caption'

    // Create run first
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      queuedAt,
      source: LogSources.Playground,
      cache: redis,
    })

    // Update both fields
    const result = await updateActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      runUuid,
      updates: { startedAt, caption },
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedRun = result.unwrap()

    expect(updatedRun.startedAt).toEqual(startedAt)
    expect(updatedRun.caption).toBe(caption)
    expect(updatedRun.source).toBe(LogSources.Playground) // Original source preserved
    expect(updatedRun.documentUuid).toBe(documentUuid)
    expect(updatedRun.commitUuid).toBe(commitUuid)
  })

  it('preserves existing fields when updating only one', async () => {
    const runUuid = 'test-uuid-4'
    const queuedAt = new Date()
    const originalStartedAt = new Date(Date.now() - 3000)
    const originalCaption = 'Original caption'
    const source = LogSources.Experiment

    // Create run
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      queuedAt,
      source,
      cache: redis,
    })

    // Update with startedAt and caption
    await updateActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      runUuid,
      updates: { startedAt: originalStartedAt, caption: originalCaption },
      cache: redis,
    })

    // Update only caption
    const result = await updateActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      runUuid,
      updates: { caption: 'New caption' },
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updatedRun = result.unwrap()
    expect(updatedRun.caption).toBe('New caption')
    expect(updatedRun.startedAt).toEqual(originalStartedAt) // Preserved
    expect(updatedRun.source).toBe(source) // Preserved
    expect(updatedRun.documentUuid).toBe(documentUuid)
    expect(updatedRun.commitUuid).toBe(commitUuid)
  })

  it('returns NotFoundError when run does not exist', async () => {
    const result = await updateActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      runUuid: 'non-existent-uuid',
      updates: { startedAt: new Date() },
      cache: redis,
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
    const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
      workspaceId,
      projectId,
      documentUuid,
    )
    testKeys.add(key)
    const createResult = await createActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      queuedAt,
      source: LogSources.API,
      cache: redis,
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    // Verify run exists before update
    const beforeUpdate = await redis.hget(key, runUuid)
    expect(beforeUpdate).toBeTruthy()

    // Update run with caption (simpler than startedAt)
    const updateResult = await updateActiveRunByDocument({
      workspaceId,
      projectId,
      documentUuid,
      runUuid,
      updates: { caption: 'Updated caption' },
      cache: redis,
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
