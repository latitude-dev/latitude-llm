import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runEvaluationJob, type RunEvaluationJobData } from './runEvaluationJob'

vi.spyOn(console, 'error').mockImplementation(() => undefined)

vi.mock('@latitude-data/core/queues', () => ({
  queues: vi.fn(() => Promise.resolve({})), // mock queues function
}))

vi.mock('@latitude-data/core/repositories', () => ({
  DocumentLogsRepository: vi.fn().mockImplementation(() => ({
    findByUuid: vi.fn(() =>
      Promise.resolve({ unwrap: () => Promise.resolve({}) }),
    ),
  })),
  EvaluationsRepository: vi.fn().mockImplementation(() => ({
    find: vi.fn(() => Promise.resolve({ unwrap: () => Promise.resolve({}) })),
  })),
}))

const runEvaluationMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      unwrap: () =>
        Promise.resolve({
          response: new Promise((resolve) => {
            resolve(null)
          }),
        }),
    }),
  ),
)
vi.mock('@latitude-data/core/services/evaluations/run', () => ({
  runEvaluation: runEvaluationMock,
}))

const mockEmit = vi.hoisted(() => vi.fn())
const mockGetSocket = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ emit: mockEmit }),
)
vi.mock('@latitude-data/core/websockets/workers', () => ({
  WebsocketClient: {
    getSocket: mockGetSocket,
  },
}))

vi.mock('@latitude-data/env', () => ({
  env: { NODE_ENV: 'test' }, // Mock environment to be 'test'
}))

const incrementCompletedMock = vi.hoisted(() => vi.fn())
const incrementErrorsMock = vi.hoisted(() => vi.fn())
vi.mock('../../utils/progressTracker', () => {
  return {
    ProgressTracker: vi.fn().mockImplementation(() => ({
      incrementCompleted: incrementCompletedMock,
      incrementErrors: incrementErrorsMock,
      getProgress: vi.fn(() => Promise.resolve({ completed: 1, total: 1 })),
    })),
  }
})

let jobData: Job<RunEvaluationJobData>
describe('runEvaluationJob', () => {
  beforeEach(() => {
    mockGetSocket.mockClear()
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

    runEvaluationMock.mockClear()
  })

  it('calls runEvaluation', async () => {
    await runEvaluationJob(jobData)
    expect(runEvaluationMock).toHaveBeenCalledWith({
      documentLog: expect.any(Object),
      evaluation: expect.any(Object),
      documentUuid: 'doc-uuid',
    })
    incrementCompletedMock.mockClear()
  })

  it('wait for runEvaluation response to finish', async () => {
    const responsePromise = new Promise((resolve) =>
      setTimeout(() => resolve('expected response'), 100),
    )
    const mockedResponse = {
      unwrap: () =>
        Promise.resolve({
          response: responsePromise,
        }),
    }

    runEvaluationMock.mockResolvedValue(mockedResponse)

    const awaitResponseSpy = vi.fn()
    responsePromise.then(awaitResponseSpy)

    await runEvaluationJob(jobData)
    expect(awaitResponseSpy).toHaveBeenCalled()
    incrementCompletedMock.mockClear()
  })

  it('increment succesfull counter', async () => {
    await runEvaluationJob(jobData)
    expect(mockGetSocket).toHaveBeenCalledTimes(1)
    expect(incrementCompletedMock).toHaveBeenCalledTimes(1)
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
    incrementCompletedMock.mockClear()
  })

  it('increment error counter', async () => {
    runEvaluationMock.mockImplementationOnce(() => {
      throw new Error('Some error occurred')
    })

    await runEvaluationJob(jobData)

    expect(mockGetSocket).toHaveBeenCalledTimes(1)
    expect(incrementErrorsMock).toHaveBeenCalledTimes(1)
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
