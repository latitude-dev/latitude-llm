import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
  ACTIVE_EVALUATIONS_CACHE_TTL,
} from '@latitude-data/constants/evaluations'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveEvaluation } from './create'
import { updateActiveEvaluation } from './update'
import { listCachedEvaluations } from './listCached'

describe('listCachedEvaluations', () => {
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

  it('returns empty array when no evaluations exist', async () => {
    // Use a unique workspace/project ID to ensure no collisions
    const uniqueWorkspaceId = Date.now()
    const uniqueProjectId = Date.now() + 1

    const result = await listCachedEvaluations({
      workspaceId: uniqueWorkspaceId,
      projectId: uniqueProjectId,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.unwrap()).toEqual([])
  })

  it('returns all active evaluations', async () => {
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    // Use unique test IDs to avoid conflicts
    const testId = Date.now()
    const workflowUuid1 = `test-uuid-list-1-${testId}`
    const workflowUuid2 = `test-uuid-list-2-${testId}`
    const queuedAt = new Date()

    // Create two evaluations
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid1,
      evaluationUuid: `test-uuid-list-123-${testId}`,
      issueId: 111,
      queuedAt,
      cache: redis,
    })

    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid2,
      evaluationUuid: `test-uuid-list-456-${testId}`,
      issueId: 222,
      queuedAt,
      cache: redis,
    })

    // List evaluations
    const result = await listCachedEvaluations({
      workspaceId,
      projectId,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const evaluations = result.unwrap()
    // Filter to only our test evaluations using the specific testId
    const testEvaluations = evaluations.filter((e) =>
      e.workflowUuid.includes(`-${testId}`),
    )
    expect(testEvaluations.length).toBe(2)
    expect(testEvaluations.map((e) => e.workflowUuid).sort()).toEqual([
      workflowUuid1,
      workflowUuid2,
    ])
  })

  it('filters out expired evaluations', async () => {
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    const recentQueuedAt = new Date()
    const expiredQueuedAt = new Date(
      Date.now() - ACTIVE_EVALUATIONS_CACHE_TTL - 1000,
    )

    // Create recent evaluation
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: 'test-uuid-list-recent',
      evaluationUuid: 'test-uuid-list-recent-123',
      issueId: 333,
      queuedAt: recentQueuedAt,
      cache: redis,
    })

    // Manually create expired evaluation by setting old queuedAt in Redis
    const expiredWorkflowUuid = 'test-uuid-list-expired'
    const expiredEvaluation = {
      workflowUuid: expiredWorkflowUuid,
      evaluationUuid: 'test-uuid-list-expired-123',
      issueId: 444,
      queuedAt: expiredQueuedAt.toISOString(),
    }
    await redis.hset(
      key,
      expiredWorkflowUuid,
      JSON.stringify(expiredEvaluation),
    )

    // List evaluations
    const result = await listCachedEvaluations({
      workspaceId,
      projectId,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const evaluations = result.unwrap()
    expect(evaluations.length).toBe(1)
    expect(evaluations[0].workflowUuid).toBe('test-uuid-list-recent')
  })

  it('reconstructs errors from serialized errors in Redis', async () => {
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    const workflowUuid1 = 'test-uuid-list-error-1'
    const workflowUuid2 = 'test-uuid-list-error-2'
    const queuedAt = new Date()
    const error1 = new Error(
      'Max attempts to generate evaluation from issue reached',
    )
    error1.name = 'CustomError1'
    const error2 = new Error('Another error')
    error2.name = 'CustomError2'

    // Create two evaluations
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid1,
      evaluationUuid: 'test-uuid-list-error-123',
      issueId: 555,
      queuedAt,
      cache: redis,
    })

    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid2,
      evaluationUuid: 'test-uuid-list-error-456',
      issueId: 666,
      queuedAt,
      cache: redis,
    })

    // Update with errors (this serializes them)
    await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid1,
      error: error1,
      cache: redis,
    })

    await updateActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid2,
      error: error2,
      cache: redis,
    })

    // List evaluations and verify errors are reconstructed
    const result = await listCachedEvaluations({
      workspaceId,
      projectId,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const evaluations = result.unwrap()
    expect(evaluations.length).toBe(2)

    const eval1 = evaluations.find((e) => e.workflowUuid === workflowUuid1)
    expect(eval1).toBeDefined()
    expect(eval1?.error).toBeInstanceOf(Error)
    expect(eval1?.error?.message).toBe(
      'Max attempts to generate evaluation from issue reached',
    )
    expect(eval1?.error?.name).toBe('CustomError1')
    expect(eval1?.error?.message.includes('Max attempts')).toBe(true)

    const eval2 = evaluations.find((e) => e.workflowUuid === workflowUuid2)
    expect(eval2).toBeDefined()
    expect(eval2?.error).toBeInstanceOf(Error)
    expect(eval2?.error?.message).toBe('Another error')
    expect(eval2?.error?.name).toBe('CustomError2')
  })

  it('handles evaluations without errors', async () => {
    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)

    const workflowUuid1 = 'test-uuid-list-no-error-1'
    const workflowUuid2 = 'test-uuid-list-no-error-2'
    const queuedAt = new Date()

    // Create two evaluations
    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid1,
      evaluationUuid: 'test-uuid-list-no-error-123',
      issueId: 777,
      queuedAt,
      cache: redis,
    })

    await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid: workflowUuid2,
      evaluationUuid: 'test-uuid-list-no-error-456',
      issueId: 888,
      queuedAt,
      cache: redis,
    })

    // List evaluations
    const result = await listCachedEvaluations({
      workspaceId,
      projectId,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const evaluations = result.unwrap()
    expect(evaluations.length).toBe(2)
    expect(evaluations.every((e) => e.error === undefined)).toBe(true)
  })
})
