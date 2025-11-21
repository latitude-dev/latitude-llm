import { ACTIVE_EVALUATIONS_CACHE_KEY } from '@latitude-data/constants/evaluations'
import { NotFoundError } from '../../../lib/errors'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveEvaluation } from './create'
import { updateActiveEvaluation } from './update'

describe('updateActiveEvaluation', () => {
  let redis: Cache
  let workspaceId: number
  let projectId: number
  const testKeys = new Set<string>()
  let testCounter = Math.floor(Date.now() / 100)

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(async () => {
    // Generate unique IDs for each test to avoid collisions in parallel execution
    workspaceId = testCounter
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

  it('updates startedAt field', async () => {
    const evaluationUuid = 'test-uuid-1'
    const issueId = 123
    const queuedAt = new Date(Date.now() - 10000) // 10 seconds ago
    const startedAt = new Date()

    // Create evaluation first
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with startedAt
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      startedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedEvaluation = result.unwrap()

    expect(updatedEvaluation.startedAt).toBeSameTimeIgnoringNanos(startedAt)
    expect(updatedEvaluation.queuedAt).toBeSameTimeIgnoringNanos(queuedAt)
    expect(updatedEvaluation.issueId).toBe(issueId)
  })

  it('updates endedAt field', async () => {
    const evaluationUuid = 'test-uuid-2'
    const issueId = 456
    const queuedAt = new Date()
    const endedAt = new Date()

    // Create evaluation first
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with endedAt
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      endedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedEvaluation = result.unwrap()

    expect(updatedEvaluation.endedAt).toBeSameTimeIgnoringNanos(endedAt)
  })

  it('updates both startedAt and endedAt', async () => {
    const evaluationUuid = 'test-uuid-3'
    const issueId = 789
    const queuedAt = new Date(Date.now() - 5000)
    const startedAt = new Date(Date.now() - 3000)
    const endedAt = new Date()

    // Create evaluation first
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update both fields
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      startedAt,
      endedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedEvaluation = result.unwrap()

    expect(updatedEvaluation.startedAt).toBeSameTimeIgnoringNanos(startedAt)
    expect(updatedEvaluation.endedAt).toBeSameTimeIgnoringNanos(endedAt)
    expect(updatedEvaluation.issueId).toBe(issueId) // Original issueId preserved
  })

  it('preserves existing fields when updating only one', async () => {
    const evaluationUuid = 'test-uuid-4'
    const issueId = 999
    const queuedAt = new Date()
    const originalStartedAt = new Date(Date.now() - 3000)

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with startedAt
    await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      startedAt: originalStartedAt,
      cache: redis,
    })

    // Update only endedAt
    const endedAt = new Date()
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      endedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updatedEvaluation = result.unwrap()
    expect(updatedEvaluation.endedAt).toBeSameTimeIgnoringNanos(endedAt)
    expect(updatedEvaluation.startedAt).toBeSameTimeIgnoringNanos(
      originalStartedAt,
    ) // Preserved
    expect(updatedEvaluation.issueId).toBe(issueId) // Preserved
  })

  it('returns NotFoundError when evaluation does not exist', async () => {
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid: 'non-existent-uuid',
      startedAt: new Date(),
      cache: redis,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain('Evaluation not found')
  })

  it('refreshes TTL on update', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const evaluationUuid = `test-uuid-ttl-${testId}`
    const issueId = 111
    const queuedAt = new Date()

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const createResult = await createActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    // Verify evaluation exists before update
    const beforeUpdate = await redis.hget(key, evaluationUuid)
    expect(beforeUpdate).toBeTruthy()

    // Update evaluation with startedAt
    const updateResult = await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      startedAt: new Date(),
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
