import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
} from '@latitude-data/constants/evaluations'
import { NotFoundError } from '../../../lib/errors'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveEvaluation } from './create'
import { deleteActiveEvaluation } from './delete'
import { updateActiveEvaluation } from './update'

describe('deleteActiveEvaluation', () => {
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

  it('deletes an active evaluation from cache', async () => {
    const evaluationUuid = 'test-uuid-1'
    const issueId = 123
    const queuedAt = new Date()

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

    // Delete evaluation
    const result = await deleteActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const deletedEvaluation = result.unwrap()

    expect(deletedEvaluation.uuid).toBe(evaluationUuid)
    expect(deletedEvaluation.issueId).toBe(issueId)

    // Verify it's removed from Redis
    const verifyKey = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    expect(hashData).not.toHaveProperty(evaluationUuid)
  })

  it('returns the deleted evaluation data', async () => {
    const evaluationUuid = 'test-uuid-2'
    const issueId = 456
    const queuedAt = new Date()
    const startedAt = new Date()
    const endedAt = new Date()

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

    // Update with startedAt and endedAt
    await updateActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      startedAt,
      endedAt,
      cache: redis,
    })

    // Delete and verify returned data
    const result = await deleteActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const deletedEvaluation = result.unwrap()

    expect(deletedEvaluation.uuid).toBe(evaluationUuid)
    expect(deletedEvaluation.queuedAt).toEqual(queuedAt)
    expect(deletedEvaluation.startedAt).toEqual(startedAt)
    expect(deletedEvaluation.endedAt).toEqual(endedAt)
    expect(deletedEvaluation.issueId).toBe(issueId)
  })

  it('returns NotFoundError when evaluation does not exist', async () => {
    const result = await deleteActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid: 'non-existent-uuid',
      cache: redis,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain('Evaluation not found')
  })

  it('handles deleting from hash with multiple evaluations', async () => {
    // Use unique evaluation UUIDs to avoid conflicts
    const testId = Date.now()
    const evaluations = [
      { uuid: `eval-1-${testId}`, issueId: 101 },
      { uuid: `eval-2-${testId}`, issueId: 102 },
      { uuid: `eval-3-${testId}`, issueId: 103 },
    ]

    // Create all evaluations
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const evaluation of evaluations) {
      const createResult = await createActiveEvaluation({
        workspaceId,
        projectId,
        evaluationUuid: evaluation.uuid,
        issueId: evaluation.issueId,
        queuedAt: new Date(),
        cache: redis,
      })
      expect(createResult.ok).toBe(true)
    }

    // Delete one evaluation
    const result = await deleteActiveEvaluation({
      workspaceId,
      projectId,
      evaluationUuid: `eval-2-${testId}`,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      console.error('Delete failed:', result.error)
      return
    }

    // Verify only that evaluation was deleted
    const verifyKey = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    expect(hashData).toHaveProperty(`eval-1-${testId}`)
    expect(hashData).not.toHaveProperty(`eval-2-${testId}`)
    expect(hashData).toHaveProperty(`eval-3-${testId}`)
  })

  it('handles deleting all evaluations from a workspace/project', async () => {
    // Use unique test ID to avoid conflicts
    const testId = Date.now()
    const evaluationUuids = [
      `eval-1-${testId}`,
      `eval-2-${testId}`,
      `eval-3-${testId}`,
    ]

    // Create evaluations
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const uuid of evaluationUuids) {
      const createResult = await createActiveEvaluation({
        workspaceId,
        projectId,
        evaluationUuid: uuid,
        issueId: 1,
        queuedAt: new Date(),
        cache: redis,
      })
      expect(createResult.ok).toBe(true)
    }

    // Delete all evaluations
    for (const uuid of evaluationUuids) {
      const result = await deleteActiveEvaluation({
        workspaceId,
        projectId,
        evaluationUuid: uuid,
        cache: redis,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) {
        console.error('Delete failed for:', uuid, result.error)
      }
    }

    // Verify our test evaluations are deleted (hash might have other evaluations from other tests)
    const verifyKey = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    for (const uuid of evaluationUuids) {
      expect(hashData).not.toHaveProperty(uuid)
    }
  })
})

