import * as env from '@latitude-data/env'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as queues from '../../../queues'
import * as repositories from '../../../repositories'
import * as evaluations from '../../../services/evaluations/run'
import * as websockets from '../../../websockets/workers'
import * as progressTracker from '../../utils/progressTracker'
import { runEvaluationJob, type RunEvaluationJobData } from './runEvaluationJob'

// Spy on console.error
vi.spyOn(console, 'error').mockImplementation(() => undefined)

// Spy on queues
// @ts-ignore
vi.spyOn(queues, 'queues').mockResolvedValue({})

// Spy on repositories
vi.spyOn(
  repositories.DocumentLogsRepository.prototype,
  'findByUuid',
  // @ts-ignore
).mockResolvedValue({ unwrap: () => Promise.resolve({}) })
vi.spyOn(
  repositories.EvaluationsRepository.prototype,
  'find',
  // @ts-ignore
).mockResolvedValue({ unwrap: () => Promise.resolve({}) })

// Spy on runEvaluation
const runEvaluationSpy = vi
  .spyOn(evaluations, 'runEvaluation')
  .mockResolvedValue({
    unwrap: () =>
      // @ts-ignore
      Promise.resolve({
        response: Promise.resolve(null),
      }),
  })

// Spy on WebsocketClient
const mockEmit = vi.fn()
// @ts-ignore
vi.spyOn(websockets.WebsocketClient, 'getSocket').mockResolvedValue({
  emit: mockEmit,
})

// Spy on env
// @ts-ignore
vi.spyOn(env, 'env', 'get').mockReturnValue({ NODE_ENV: 'test' })

// Spy on ProgressTracker
const incrementCompletedSpy = vi.fn()
const incrementErrorsSpy = vi.fn()
vi.spyOn(progressTracker, 'ProgressTracker').mockImplementation(() => ({
  incrementCompleted: incrementCompletedSpy,
  incrementErrors: incrementErrorsSpy,
  // @ts-ignore
  getProgress: vi.fn(() => Promise.resolve({ completed: 1, total: 1 })),
}))

let jobData: Job<RunEvaluationJobData>
describe('runEvaluationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    jobData = {
      id: '1',
      data: {
        workspaceId: 1,
        documentUuid: 'doc-uuid',
        documentLogUuid: 'log-uuid',
        evaluationId: 2,
        batchId: 'batch-123',
        skipProgress: false,
      },
    } as Job<RunEvaluationJobData>
  })

  it('calls runEvaluation', async () => {
    await runEvaluationJob(jobData)
    expect(runEvaluationSpy).toHaveBeenCalledWith({
      documentLog: expect.any(Object),
      evaluation: expect.any(Object),
      documentUuid: 'doc-uuid',
    })
  })

  it('wait for runEvaluation response to finish', async () => {
    const responsePromise = new Promise((resolve) =>
      setTimeout(() => resolve('expected response'), 100),
    )
    runEvaluationSpy.mockResolvedValueOnce({
      unwrap: () =>
        // @ts-ignore
        Promise.resolve({
          response: responsePromise,
        }),
    })

    const awaitResponseSpy = vi.fn()
    responsePromise.then(awaitResponseSpy)

    await runEvaluationJob(jobData)
    expect(awaitResponseSpy).toHaveBeenCalled()
  })

  it('increment successful counter', async () => {
    await runEvaluationJob(jobData)

    expect(websockets.WebsocketClient.getSocket).toHaveBeenCalledTimes(1)
    expect(incrementCompletedSpy).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith('evaluationStatus', {
      workspaceId: 1,
      data: {
        batchId: 'batch-123',
        evaluationId: 2,
        documentUuid: 'doc-uuid',
        completed: 1,
        total: 1,
      },
    })
  })

  it('increment error counter', async () => {
    runEvaluationSpy.mockRejectedValueOnce(new Error('Some error occurred'))

    await runEvaluationJob(jobData)

    expect(websockets.WebsocketClient.getSocket).toHaveBeenCalledTimes(1)
    expect(incrementErrorsSpy).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith('evaluationStatus', {
      workspaceId: 1,
      data: {
        batchId: 'batch-123',
        evaluationId: 2,
        documentUuid: 'doc-uuid',
        completed: 1,
        total: 1,
      },
    })
  })
})
