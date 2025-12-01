import { ACTIVE_EVALUATIONS_CACHE_KEY } from '@latitude-data/constants/evaluations'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Cache } from '../../../cache'
import { cache } from '../../../cache'
import { createActiveEvaluation } from './create'

describe('createActiveEvaluation', () => {
  let redis: Cache
  let workspaceId: number
  let projectId: number
  const testKeys = new Set<string>()
  let testCounter = Math.floor(Date.now() / 1000)

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

  it('creates an active evaluation in cache', async () => {
    const workflowUuid = 'test-uuid-1'
    const evaluationUuid = 'test-uuid-123123'
    const issueId = 123
    const queuedAt = new Date()

    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const result = await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.value) return

    expect(result.value.workflowUuid).toBe(workflowUuid)
    expect(result.value.evaluationUuid).toBe(evaluationUuid)
    expect(result.value.issueId).toBe(issueId)
    expect(result.value.queuedAt).toEqual(queuedAt)
  })

  it('stores evaluation in Redis hash', async () => {
    const workflowUuid = 'test-uuid-2'
    const evaluationUuid = 'test-uuid-223232'
    const issueId = 456
    const queuedAt = new Date()

    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const result = await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Verify it's stored in Redis
    const hashData = await redis.hgetall(key)
    expect(hashData).toHaveProperty(workflowUuid)

    const storedEvaluation = JSON.parse(hashData[workflowUuid]!)
    expect(storedEvaluation.workflowUuid).toBe(workflowUuid)
    expect(storedEvaluation.evaluationUuid).toBe(evaluationUuid)
    expect(storedEvaluation.issueId).toBe(issueId)
  })

  it('sets TTL on the hash key', async () => {
    const workflowUuid = 'test-uuid-3'
    const evaluationUuid = 'test-uuid-333333'
    const issueId = 789
    const queuedAt = new Date()

    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    const result = await createActiveEvaluation({
      workspaceId,
      projectId,
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
      cache: redis,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Verify TTL is set (should be around 3 hours = 10800 seconds)
    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(10700) // Allow some margin for execution time
    expect(ttl).toBeLessThanOrEqual(10800)
  })

  it('handles different issue IDs', async () => {
    const issueIds = [100, 200, 300]

    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const issueId of issueIds) {
      const workflowUuid = `test-uuid-${issueId}`
      const evaluationUuid = `test-uuid-${issueId}-222222`
      const queuedAt = new Date()

      const result = await createActiveEvaluation({
        workspaceId,
        projectId,
        workflowUuid,
        evaluationUuid,
        issueId,
        queuedAt,
        cache: redis,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) continue

      const createdEvaluation = result.unwrap()
      expect(createdEvaluation.issueId).toBe(issueId)
    }
  })

  it('handles multiple evaluations for same workspace/project', async () => {
    const evaluations = [
      { workflowUuid: 'eval-1', evaluationUuid: 'eval-111111', issueId: 101 },
      { workflowUuid: 'eval-2', evaluationUuid: 'eval-222222', issueId: 102 },
      { workflowUuid: 'eval-3', evaluationUuid: 'eval-333333', issueId: 103 },
    ]

    const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
    testKeys.add(key)
    for (const evaluation of evaluations) {
      const result = await createActiveEvaluation({
        workspaceId,
        projectId,
        workflowUuid: evaluation.workflowUuid,
        evaluationUuid: evaluation.evaluationUuid,
        issueId: evaluation.issueId,
        queuedAt: new Date(),
        cache: redis,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
    }

    // Verify all evaluations are stored
    const hashData = await redis.hgetall(key)
    expect(Object.keys(hashData)).toHaveLength(3)
  })

  it('handles different workspaces and projects', async () => {
    // Use unique IDs to avoid conflicts with other tests
    const baseWsId = testCounter++
    const workspaces = [
      { workspaceId: baseWsId, projectId: baseWsId + 10 },
      { workspaceId: baseWsId, projectId: baseWsId + 20 },
      { workspaceId: baseWsId + 1, projectId: baseWsId + 10 },
    ]

    // Track keys before creating evaluations
    for (const { workspaceId: wsId, projectId: projId } of workspaces) {
      const key = ACTIVE_EVALUATIONS_CACHE_KEY(wsId, projId)
      testKeys.add(key)
    }

    for (const { workspaceId: wsId, projectId: projId } of workspaces) {
      const result = await createActiveEvaluation({
        workspaceId: wsId,
        projectId: projId,
        workflowUuid: `eval-${wsId}-${projId}`,
        issueId: 1,
        queuedAt: new Date(),
        cache: redis,
      })

      expect(result.ok).toBe(true)
    }

    // Verify each has its own hash with exactly one evaluation
    for (const { workspaceId: wsId, projectId: projId } of workspaces) {
      const key = ACTIVE_EVALUATIONS_CACHE_KEY(wsId, projId)
      testKeys.add(key)
      const hashData = await redis.hgetall(key)
      const evalKeys = Object.keys(hashData).filter((k) =>
        k.startsWith(`eval-${wsId}-${projId}`),
      )
      expect(evalKeys).toHaveLength(1)
    }
  })
})
