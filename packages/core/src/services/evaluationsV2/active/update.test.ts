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
    const workflowUuid = 'test-uuid-1'
    const evaluationUuid = 'test-uuid-123123'
    const issueId = 123
    const queuedAt = new Date(Date.now() - 10000) // 10 seconds ago
    const startedAt = new Date()

    // Create evaluation first
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with startedAt
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
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
    const workflowUuid = 'test-uuid-2'
    const evaluationUuid = 'test-uuid-223232'
    const issueId = 456
    const queuedAt = new Date()
    const endedAt = new Date()

    // Create evaluation first
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with endedAt
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      endedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedEvaluation = result.unwrap()

    expect(updatedEvaluation.endedAt).toBeSameTimeIgnoringNanos(endedAt)
  })

  it('preserves existing fields when updating only one', async () => {
    const workflowUuid = 'test-uuid-4'
    const evaluationUuid = 'test-uuid-444444'
    const issueId = 999
    const queuedAt = new Date()
    const originalStartedAt = new Date(Date.now() - 3000)

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with startedAt
    await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      startedAt: originalStartedAt,
      cache: redis,
    })

    // Update only endedAt
    const endedAt = new Date()
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
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
      workflowUuid: 'non-existent-uuid',
      startedAt: new Date(),
      cache: redis,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain('Active evaluation not found')
  })

  it('refreshes TTL on update', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const workflowUuid = `test-uuid-ttl-${testId}`
    const evaluationUuid = `test-uuid-ttl-${testId}`
    const issueId = 111
    const queuedAt = new Date()

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const createResult = await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    // Verify evaluation exists before update
    const beforeUpdate = await redis.hget(key, workflowUuid)
    expect(beforeUpdate).toBeTruthy()

    // Update evaluation with startedAt
    const updateResult = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
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

  it('updates evaluationUuid field', async () => {
    const workflowUuid = 'test-uuid-5'
    const evaluationUuid = 'test-uuid-555555'
    const issueId = 111
    const queuedAt = new Date()

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const createResult = await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    // Update evaluation with evaluationUuid
    const newEvaluationUuid = 'test-uuid-555555-updated'
    const updateResult = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid: newEvaluationUuid,
      cache: redis,
    })
    expect(updateResult.ok).toBe(true)
    if (!updateResult.ok) return

    const updatedEvaluation = updateResult.unwrap()
    expect(updatedEvaluation.evaluationUuid).toBe(newEvaluationUuid)
  })

  it('serializes and stores error as plain object', async () => {
    const workflowUuid = 'test-uuid-error-1'
    const evaluationUuid = 'test-uuid-error-123'
    const issueId = 999
    const queuedAt = new Date()
    const error = new Error('Test error message')

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with error
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      error,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedEvaluation = result.unwrap()
    // Should return Error object with message
    expect(updatedEvaluation.error).toBeInstanceOf(Error)
    expect(updatedEvaluation.error?.message).toBe('Test error message')
    expect(updatedEvaluation.error?.name).toBe('Error')

    // Verify it's stored as serialized object in Redis
    const storedJson = await redis.hget(key, workflowUuid)
    expect(storedJson).toBeTruthy()
    if (storedJson) {
      const stored = JSON.parse(storedJson)
      // Error should be stored as plain object, not Error instance
      expect(stored.error).toBeDefined()
      expect(stored.error).not.toBeInstanceOf(Error)
      expect(stored.error.message).toBe('Test error message')
      expect(stored.error.name).toBe('Error')
      expect(stored.error.stack).toBeDefined()
    }
  })

  it('preserves existing error when updating other fields', async () => {
    const workflowUuid = 'test-uuid-error-2'
    const evaluationUuid = 'test-uuid-error-456'
    const issueId = 888
    const queuedAt = new Date()
    const originalError = new Error('Original error')

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with error first
    await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      error: originalError,
      cache: redis,
    })

    // Update with startedAt (should preserve error)
    const startedAt = new Date()
    const result = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      startedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updatedEvaluation = result.unwrap()
    expect(updatedEvaluation.startedAt).toBeSameTimeIgnoringNanos(startedAt)
    // Error should be preserved
    expect(updatedEvaluation.error).toBeInstanceOf(Error)
    expect(updatedEvaluation.error?.message).toBe('Original error')
  })

  it('reconstructs error from stored serialized error', async () => {
    const workflowUuid = 'test-uuid-error-3'
    const evaluationUuid = 'test-uuid-error-789'
    const issueId = 777
    const queuedAt = new Date()
    const error = new Error(
      'Max attempts to generate evaluation from issue reached',
    )
    error.name = 'CustomError'

    // Create evaluation
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update with error
    const updateResult = await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      error,
      cache: redis,
    })

    expect(updateResult.ok).toBe(true)
    if (!updateResult.ok) return

    const updatedEvaluation = updateResult.unwrap()
    // Verify error is reconstructed properly
    expect(updatedEvaluation.error).toBeInstanceOf(Error)
    expect(updatedEvaluation.error?.message).toBe(
      'Max attempts to generate evaluation from issue reached',
    )
    expect(updatedEvaluation.error?.name).toBe('CustomError')
    // Verify error.message.includes works (this is what the frontend checks)
    expect(updatedEvaluation.error?.message.includes('Max attempts')).toBe(true)
  })
})
