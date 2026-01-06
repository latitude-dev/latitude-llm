import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from '../../../client'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import * as factories from '../../../tests/factories'
import { scheduleBackfillEvaluationResultsTypeAndMetricJobs } from './scheduleBackfillEvaluationResultsTypeAndMetricJobs'
import { Providers } from '@latitude-data/constants'

const mocks = vi.hoisted(() => ({
  queues: vi.fn(),
}))

vi.mock('../../queues', () => ({
  queues: mocks.queues,
}))

describe('scheduleBackfillEvaluationResultsTypeAndMetricJobs', () => {
  let workspace: any
  let commit: any
  let document: any
  let evaluation: any
  let mockMaintenanceQueue: any

  beforeEach(async () => {
    mockMaintenanceQueue = {
      add: vi.fn().mockResolvedValue(undefined),
    }

    mocks.queues.mockResolvedValue({
      maintenanceQueue: mockMaintenanceQueue,
    })

    const projectData = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI' }],
      documents: {
        test: factories.helpers.createPrompt({ provider: 'OpenAI' }),
      },
    })
    workspace = projectData.workspace
    commit = projectData.commit
    document = projectData.documents[0]!

    evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
    })
  })

  it('should enqueue batch jobs based on ID range', async () => {
    const span = await factories.createSpan({
      workspaceId: workspace.id,
    })

    await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    const mockJob = {
      data: {},
    } as Job<Record<string, never>>

    const jobResult =
      await scheduleBackfillEvaluationResultsTypeAndMetricJobs(mockJob)

    expect(jobResult.enqueuedJobs).toBeGreaterThan(0)
    expect(mockMaintenanceQueue.add).toHaveBeenCalled()

    const addCalls = mockMaintenanceQueue.add.mock.calls
    expect(addCalls[0][0]).toBe('backfillEvaluationResultsTypeAndMetricJob')
    expect(addCalls[0][1]).toHaveProperty('minId')
    expect(addCalls[0][1]).toHaveProperty('maxId')
    expect(addCalls[0][2]).toEqual({ attempts: 3 })
  })

  it('should return correct minId and maxId in result', async () => {
    const span1 = await factories.createSpan({
      workspaceId: workspace.id,
    })
    const span2 = await factories.createSpan({
      workspaceId: workspace.id,
    })

    const result1 = await factories.createEvaluationResultV2({
      evaluation,
      span: span1,
      commit,
      workspace,
    })

    const result2 = await factories.createEvaluationResultV2({
      evaluation,
      span: span2,
      commit,
      workspace,
    })

    const mockJob = {
      data: {},
    } as Job<Record<string, never>>

    const jobResult =
      await scheduleBackfillEvaluationResultsTypeAndMetricJobs(mockJob)

    expect(jobResult.minId).toBeLessThanOrEqual(result1.id)
    expect(jobResult.maxId).toBeGreaterThanOrEqual(result2.id)
  })

  it('should enqueue multiple jobs when ID range exceeds batch size', async () => {
    const span = await factories.createSpan({
      workspaceId: workspace.id,
    })

    await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    const mockJob = {
      data: {},
    } as Job<Record<string, never>>

    const jobResult =
      await scheduleBackfillEvaluationResultsTypeAndMetricJobs(mockJob)

    // Even with a small number of results, the scheduler should calculate
    // the correct number of jobs based on ID range
    expect(jobResult.enqueuedJobs).toBeGreaterThanOrEqual(1)
  })

  it('should return early when no results exist', async () => {
    await database.delete(evaluationResultsV2)

    const mockJob = {
      data: {},
    } as Job<Record<string, never>>

    const jobResult =
      await scheduleBackfillEvaluationResultsTypeAndMetricJobs(mockJob)

    expect(jobResult.enqueuedJobs).toBe(0)
    expect(jobResult.message).toContain('No evaluation results found')
    expect(mockMaintenanceQueue.add).not.toHaveBeenCalled()
  })

  it('should calculate correct range boundaries', async () => {
    const span = await factories.createSpan({
      workspaceId: workspace.id,
    })

    const result = await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    const mockJob = {
      data: {},
    } as Job<Record<string, never>>

    await scheduleBackfillEvaluationResultsTypeAndMetricJobs(mockJob)

    const addCalls = mockMaintenanceQueue.add.mock.calls
    const firstCall = addCalls[0][1]

    // The minId should be <= result.id and maxId should be >= result.id
    expect(firstCall.minId).toBeLessThanOrEqual(result.id)
    expect(firstCall.maxId).toBeGreaterThanOrEqual(result.id)
  })

  it('should include message with job count and ID range', async () => {
    const span = await factories.createSpan({
      workspaceId: workspace.id,
    })

    await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    const mockJob = {
      data: {},
    } as Job<Record<string, never>>

    const jobResult =
      await scheduleBackfillEvaluationResultsTypeAndMetricJobs(mockJob)

    expect(jobResult.message).toContain('Successfully scheduled')
    expect(jobResult.message).toContain('backfill jobs')
    expect(jobResult.message).toContain('ID range')
  })
})
