import { randomUUID } from 'crypto'

import { Workspace } from '@latitude-data/core/browser'
import { findWorkspaceFromDocument } from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { previewDataset } from '@latitude-data/core/services/datasets/preview'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProgressTracker } from '../../utils/progressTracker'
import { runBatchEvaluationJob } from './runBatchEvaluationJob'

const mocks = vi.hoisted(() => ({
  queues: {
    defaultQueue: {
      jobs: {
        enqueueRunDocumentJob: vi.fn(),
      },
    },
  },
}))

// Mock dependencies
vi.mock('@latitude-data/core/data-access', () => ({
  findWorkspaceFromDocument: vi.fn(),
}))

vi.mock('@latitude-data/core/repositories', () => ({
  CommitsRepository: vi.fn().mockImplementation(() => ({
    find: vi.fn().mockResolvedValue({
      unwrap: () => ({ id: 'commit-1' }),
    }),
  })),
}))

vi.mock('@latitude-data/core/services/datasets/preview', () => ({
  previewDataset: vi.fn(),
}))

vi.mock('../../', () => ({
  setupJobs: vi.fn().mockImplementation(() => mocks.queues),
}))

vi.mock('../../utils/progressTracker', () => ({
  ProgressTracker: vi.fn().mockImplementation(() => ({
    initializeProgress: vi.fn(),
    getProgress: vi.fn().mockResolvedValue({ enqueued: 0 }),
    incrementEnqueued: vi.fn(),
  })),
}))

describe('runBatchEvaluationJob', () => {
  let mockJob: Job
  let mockProgressTracker: ProgressTracker

  beforeEach(() => {
    vi.clearAllMocks()

    mockJob = {
      data: {
        evaluation: { id: 1 },
        dataset: { fileMetadata: { rowCount: 3 } },
        document: { commitId: 'commit-1' },
        parametersMap: { param1: 0, param2: 1 },
      },
      attemptsMade: 0,
    } as unknown as Job

    // @ts-ignore
    mockProgressTracker = {
      initializeProgress: vi.fn(),
      getProgress: vi.fn().mockResolvedValue({ enqueued: 0 }),
      incrementEnqueued: vi.fn(),
    }

    vi.mocked(ProgressTracker).mockImplementation(
      () => mockProgressTracker as any,
    )

    vi.mocked(findWorkspaceFromDocument).mockResolvedValue({
      id: 'workspace-1',
    } as unknown as Workspace)
    vi.mocked(previewDataset).mockResolvedValue({
      // @ts-ignore
      unwrap: () => ({
        rows: [
          ['value1', 'value2'],
          ['value3', 'value4'],
          ['value5', 'value6'],
        ],
      }),
    })
  })

  it('should process all rows and enqueue jobs', async () => {
    await runBatchEvaluationJob(mockJob)

    expect(
      mocks.queues.defaultQueue.jobs.enqueueRunDocumentJob,
    ).toHaveBeenCalledTimes(3)
    expect(
      mocks.queues.defaultQueue.jobs.enqueueRunDocumentJob,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        parameters: { param1: 'value1', param2: 'value2' },
        evaluationId: 1,
        batchId: expect.any(String),
      }),
    )
  })

  it('should use provided fromLine and toLine', async () => {
    mockJob.data.fromLine = 1
    mockJob.data.toLine = 3

    await runBatchEvaluationJob(mockJob)

    expect(vi.mocked(previewDataset)).toHaveBeenCalledWith(
      expect.objectContaining({
        fromLine: 1,
        toLine: 3,
      }),
    )
    expect(
      vi.mocked(mocks.queues.defaultQueue.jobs.enqueueRunDocumentJob),
    ).toHaveBeenCalledTimes(3)
  })

  it('should use provided batchId', async () => {
    const batchId = randomUUID()
    mockJob.data.batchId = batchId

    await runBatchEvaluationJob(mockJob)

    expect(
      vi.mocked(mocks.queues.defaultQueue.jobs.enqueueRunDocumentJob),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId,
      }),
    )
  })

  it('should throw NotFoundError if workspace is not found', async () => {
    // @ts-ignore
    vi.mocked(findWorkspaceFromDocument).mockResolvedValue(null)

    await expect(runBatchEvaluationJob(mockJob)).rejects.toThrow(NotFoundError)
  })

  it('should resume from last enqueued job on retry', async () => {
    mockJob.attemptsMade = 1
    // @ts-ignore
    mockProgressTracker.getProgress.mockResolvedValue({ enqueued: 2 })

    await runBatchEvaluationJob(mockJob)

    expect(
      vi.mocked(mocks.queues.defaultQueue.jobs.enqueueRunDocumentJob),
    ).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(mocks.queues.defaultQueue.jobs.enqueueRunDocumentJob),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: { param1: 'value5', param2: 'value6' },
      }),
    )
  })

  it('should initialize progress on first attempt', async () => {
    await runBatchEvaluationJob(mockJob)

    expect(mockProgressTracker.initializeProgress).toHaveBeenCalledWith(3)
  })

  it('should not initialize progress on retry attempts', async () => {
    mockJob.attemptsMade = 1
    await runBatchEvaluationJob(mockJob)

    expect(mockProgressTracker.initializeProgress).not.toHaveBeenCalled()
  })
})
