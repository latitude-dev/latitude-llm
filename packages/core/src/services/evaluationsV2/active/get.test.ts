import { ACTIVE_EVALUATIONS_CACHE_KEY } from '@latitude-data/constants/evaluations'
import { NotFoundError } from '../../../lib/errors'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveEvaluation } from './create'
import { updateActiveEvaluation } from './update'
import { getActiveEvaluation } from './get'

describe('getActiveEvaluation', () => {
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
    for (const key of testKeys) {
      await redis.del(key)
    }
    testKeys.clear()
  })

  it('retrieves active evaluation', async () => {
    const workflowUuid = 'test-uuid-get-1'
    const evaluationUuid = 'test-uuid-get-123'
    const issueId = 123
    const queuedAt = new Date()
    const startedAt = new Date()

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
      startedAt,
      cache: redis,
    })

    // Get evaluation
    const result = await getActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const evaluation = result.unwrap()
    expect(evaluation.workflowUuid).toBe(workflowUuid)
    expect(evaluation.evaluationUuid).toBe(evaluationUuid)
    expect(evaluation.issueId).toBe(issueId)
    expect(evaluation.queuedAt).toBeSameTimeIgnoringNanos(queuedAt)
    expect(evaluation.startedAt).toBeSameTimeIgnoringNanos(startedAt)
  })

  it('returns NotFoundError when evaluation does not exist', async () => {
    const result = await getActiveEvaluation({
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

  it('reconstructs error from serialized error in Redis', async () => {
    const workflowUuid = 'test-uuid-get-error-1'
    const evaluationUuid = 'test-uuid-get-error-123'
    const issueId = 999
    const queuedAt = new Date()
    const error = new Error('Max attempts to generate evaluation from issue reached')
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

    // Update with error (this serializes it)
    await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      error,
      cache: redis,
    })

    // Get evaluation and verify error is reconstructed
    const result = await getActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const evaluation = result.unwrap()
    expect(evaluation.error).toBeInstanceOf(Error)
    expect(evaluation.error?.message).toBe(
      'Max attempts to generate evaluation from issue reached',
    )
    expect(evaluation.error?.name).toBe('CustomError')
    // Verify error.message.includes works (this is what the frontend checks)
    expect(evaluation.error?.message.includes('Max attempts')).toBe(true)
  })

  it('handles evaluation without error', async () => {
    const workflowUuid = 'test-uuid-get-no-error'
    const evaluationUuid = 'test-uuid-get-no-error-123'
    const issueId = 456
    const queuedAt = new Date()

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

    // Get evaluation
    const result = await getActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const evaluation = result.unwrap()
    expect(evaluation.error).toBeUndefined()
  })
})

