import { ACTIVE_EVALUATIONS_CACHE_KEY } from '@latitude-data/constants/evaluations'
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
    const workflowUuid = 'test-uuid-1'
    const issueId = 123
    const queuedAt = new Date()

    // Create active evaluation without evaluationUuid
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Delete active evaluation
    const result = await deleteActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const deletedEvaluation = result.unwrap()

    expect(deletedEvaluation.evaluationUuid).toBeUndefined()
    expect(deletedEvaluation.issueId).toBe(issueId)

    // Verify it's removed from Redis
    const verifyKey = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    expect(hashData).not.toHaveProperty(workflowUuid)
  })

  it('returns the deleted evaluation data', async () => {
    const workflowUuid = 'test-uuid-2'
    const initialEvaluationUuid = 'test-uuid-223232'
    const issueId = 456
    const queuedAt = new Date()

    // Create active evaluation with initialEvaluationUuid
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid: initialEvaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    // Update evaluationUuid, startedAt, and endedAt
    const newEvaluationUuid = 'test-uuid-223232-updated'
    const startedAt = new Date()
    const endedAt = new Date()
    await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid: newEvaluationUuid,
      startedAt,
      endedAt,
      cache: redis,
    })

    // Delete and verify returned data
    const result = await deleteActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const deletedEvaluation = result.unwrap()

    expect(deletedEvaluation.workflowUuid).toBe(workflowUuid)
    expect(deletedEvaluation.evaluationUuid).toBe(newEvaluationUuid)
    expect(deletedEvaluation.queuedAt).toEqual(queuedAt)
    expect(deletedEvaluation.startedAt).toEqual(startedAt)
    expect(deletedEvaluation.endedAt).toEqual(endedAt)
    expect(deletedEvaluation.issueId).toBe(issueId)
  })

  it('returns NotFoundError when evaluation does not exist', async () => {
    const result = await deleteActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: 'non-existent-uuid',
      cache: redis,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain('Active evaluation not found')
  })

  it('handles deleting from hash with multiple evaluations', async () => {
    // Use unique evaluation UUIDs to avoid conflicts
    const testId = Date.now()
    const evaluations = [
      {
        workflowUuid: `eval-1-${testId}`,
        evaluationUuid: 'eval-111111',
        issueId: 101,
      },
      {
        workflowUuid: `eval-2-${testId}`,
        evaluationUuid: 'eval-222222',
        issueId: 102,
      },
      {
        workflowUuid: `eval-3-${testId}`,
        evaluationUuid: 'eval-333333',
        issueId: 103,
      },
    ]

    // Create all evaluations
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const evaluation of evaluations) {
      const createResult = await createActiveEvaluation({
        workspaceId,
        projectId,
        workflowUuid: evaluation.workflowUuid,
        evaluationUuid: evaluation.evaluationUuid,
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
      workflowUuid: `eval-2-${testId}`,
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
    const workflowUuids = [
      `eval-1-${testId}`,
      `eval-2-${testId}`,
      `eval-3-${testId}`,
    ]

    // Create evaluations
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const workflowUuid of workflowUuids) {
      const createResult = await createActiveEvaluation({
        workspaceId,
        projectId,
        workflowUuid,
        issueId: 1,
        queuedAt: new Date(),
        cache: redis,
      })
      expect(createResult.ok).toBe(true)
    }

    // Delete all evaluations
    for (const workflowUuid of workflowUuids) {
      const result = await deleteActiveEvaluation({
        workspaceId,
        projectId,
        workflowUuid,
        cache: redis,
      })
      expect(result.ok).toBe(true)
    }

    // Verify our test evaluations are deleted (hash might have other evaluations from other tests)
    const verifyKey = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    const hashData = await redis.hgetall(verifyKey)
    for (const workflowUuid of workflowUuids) {
      expect(hashData).not.toHaveProperty(workflowUuid)
    }
  })
})
