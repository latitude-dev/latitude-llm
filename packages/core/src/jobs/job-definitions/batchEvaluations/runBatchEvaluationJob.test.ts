import { randomUUID } from 'crypto'

import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as jobsModule from '../../'
import { WorkspaceDto } from '../../../browser'
import { findWorkspaceFromDocument } from '../../../data-access'
import { CommitsRepository } from '../../../repositories'
import * as datasetsPreview from '../../../services/datasets/preview'
import * as WebsocketClientModule from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { runBatchEvaluationJob } from './runBatchEvaluationJob'

const mocks = vi.hoisted(() => ({
  websockets: {
    emit: vi.fn(),
  },
  queues: {
    defaultQueue: {
      jobs: {
        enqueueRunDocumentForEvaluationJob: vi.fn(),
      },
    },
    eventsQueue: {
      jobs: {
        enqueueCreateEventJob: vi.fn(),
        enqueuePublishEventJob: vi.fn(),
        enqueuePublishToAnalyticsJob: vi.fn(),
      },
    },
  },
}))

// Mock dependencies
vi.mock('../../../data-access', () => ({
  findWorkspaceFromDocument: vi.fn(),
}))

const commitRepoSpy = vi.spyOn(CommitsRepository.prototype, 'getCommitByUuid')
commitRepoSpy.mockResolvedValue({
  // @ts-ignore - mock implementation
  unwrap: () => ({ id: 'commit-1', uuid: 'commit-uuid-1', projectId: 1 }),
})

// Replace the mock for previewDataset with a spy
const previewDatasetSpy = vi.spyOn(datasetsPreview, 'previewDataset')
previewDatasetSpy.mockResolvedValue({
  // @ts-ignore - mock implementation
  unwrap: () => ({
    rows: [
      ['value1', 'value2'],
      ['value3', 'value4'],
      ['value5', 'value6'],
    ],
  }),
})

// Replace the mock of setupJobs with a spy
const setupJobsSpy = vi.spyOn(jobsModule, 'setupJobs')
// @ts-expect-error - mock implementation
setupJobsSpy.mockResolvedValue(mocks.queues)

// Replace the mock for ProgressTracker with a spy
const progressTrackerSpy = {
  initializeProgress: vi.fn(),
  getProgress: vi
    .fn()
    .mockResolvedValue({ total: 3, completed: 0, enqueued: 0 }),
  incrementEnqueued: vi.fn(),
}

vi.spyOn(ProgressTracker.prototype, 'initializeProgress').mockImplementation(
  progressTrackerSpy.initializeProgress,
)
vi.spyOn(ProgressTracker.prototype, 'getProgress').mockImplementation(
  progressTrackerSpy.getProgress,
)
vi.spyOn(ProgressTracker.prototype, 'incrementEnqueued').mockImplementation(
  progressTrackerSpy.incrementEnqueued,
)

// Replace the mock of WebsocketClient with a spy
const websocketClientSpy = vi.spyOn(
  WebsocketClientModule.WebsocketClient,
  'getSocket',
)
// @ts-expect-error - mock implementation
websocketClientSpy.mockResolvedValue(mocks.websockets)

describe('runBatchEvaluationJob', () => {
  let mockJob: Job

  beforeEach(() => {
    vi.clearAllMocks()

    // @ts-ignore
    mockJob = {
      data: {
        evaluation: { id: 1 },
        dataset: { fileMetadata: { rowCount: 3 } },
        document: { documentUuid: 'fake-document-uuid', commitId: 'commit-1' },
        commitUuid: 'commit-uuid-1',
        projectId: 1,
        parametersMap: { param1: 0, param2: 1 },
        workspace: { id: 'workspace-1' },
        user: { id: 'user-1', email: 'user-1@example.com' },
      } as unknown as Job,
      attemptsMade: 0,
    }

    vi.mocked(findWorkspaceFromDocument).mockResolvedValue({
      id: 'workspace-1',
    } as unknown as WorkspaceDto)
  })

  it('should emit first run evalution message', async () => {
    await runBatchEvaluationJob(mockJob)

    expect(websocketClientSpy).toHaveBeenCalled()
    expect(mocks.websockets.emit).toHaveBeenCalledWith('evaluationStatus', {
      workspaceId: 'workspace-1',
      data: {
        batchId: expect.any(String),
        evaluationId: 1,
        documentUuid: 'fake-document-uuid',
        enqueued: 0,
        total: 3,
        completed: 0,
      },
    })
  })

  it('should setup jobs', async () => {
    await runBatchEvaluationJob(mockJob)

    expect(setupJobsSpy).toHaveBeenCalled()
  })

  it('find commit by uuid and project Id', async () => {
    await runBatchEvaluationJob(mockJob)

    expect(commitRepoSpy).toHaveBeenCalledWith({
      projectId: 1,
      uuid: 'commit-uuid-1',
    })
  })

  it('should process all rows and enqueue jobs', async () => {
    await runBatchEvaluationJob(mockJob)

    expect(
      mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
    ).toHaveBeenCalledTimes(3)
    expect(
      mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
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

    expect(previewDatasetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromLine: 1,
        toLine: 3,
      }),
    )
    expect(
      vi.mocked(
        mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
      ),
    ).toHaveBeenCalledTimes(3)
  })

  it('should use provided batchId', async () => {
    const batchId = randomUUID()
    mockJob.data.batchId = batchId

    await runBatchEvaluationJob(mockJob)

    expect(
      vi.mocked(
        mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
      ),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId,
      }),
    )
  })

  it('should resume from last enqueued job on retry', async () => {
    mockJob.attemptsMade = 1
    // @ts-ignore
    progressTrackerSpy.getProgress.mockResolvedValueOnce({ enqueued: 2 })

    await runBatchEvaluationJob(mockJob)

    expect(
      vi.mocked(
        mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
      ),
    ).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(
        mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
      ),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: { param1: 'value5', param2: 'value6' },
      }),
    )
  })

  it('should initialize progress on first attempt', async () => {
    await runBatchEvaluationJob(mockJob)

    expect(progressTrackerSpy.initializeProgress).toHaveBeenCalledWith(3)
  })

  it('should not initialize progress on retry attempts', async () => {
    mockJob.attemptsMade = 1
    await runBatchEvaluationJob(mockJob)

    expect(progressTrackerSpy.initializeProgress).not.toHaveBeenCalled()
  })
})
