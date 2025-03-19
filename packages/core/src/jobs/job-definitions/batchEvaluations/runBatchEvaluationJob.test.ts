import { randomUUID } from 'crypto'

import { Job } from 'bullmq'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as jobsModule from '../../'
import { Dataset, DatasetV2, Providers } from '../../../browser'
import * as datasetsPreview from '../../../services/datasets/preview'
import { identityHashAlgorithm } from '../../../services/datasetsV2/utils'
import * as factories from '../../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../../tests/factories'
import getTestDisk from '../../../tests/testDrive'
import * as WebsocketClientModule from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import {
  runBatchEvaluationJob,
  RunBatchEvaluationJobParams,
} from './runBatchEvaluationJob'

const testDrive = getTestDisk()
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

// Replace the mock of setupQueues with a spy
const setupQueuesSpy = vi.spyOn(jobsModule, 'setupQueues')
// @ts-ignore
setupQueuesSpy.mockResolvedValue(mocks.queues)

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

function buildFakeJob(data: Partial<Job<RunBatchEvaluationJobParams>>['data']) {
  return {
    data: {
      workspace: data!.workspace,
      evaluation: { id: 1, version: 'v1' },
      document: data!.document,
      commitUuid: data!.commitUuid,
      projectId: data!.projectId,

      // Configurable data
      dataset: data!.dataset,
      parametersMap: data!.parametersMap,
      user: { id: 'user-1', email: 'user-1@example.com' },
      fromLine: data!.fromLine,
      toLine: data!.toLine,
    },
    attemptsMade: 0,
  } as unknown as Job<RunBatchEvaluationJobParams>
}

let setup: FactoryCreateProjectReturn
let commonJobData: Job<RunBatchEvaluationJobParams>['data']
describe('runBatchEvaluationJob', () => {
  beforeAll(async () => {
    setup = await factories.createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        foo: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })
    // @ts-ignore
    commonJobData = {
      user: setup.user,
      workspace: setup.workspace,
      document: setup.documents[0]!,
      projectId: setup.project.id,
      commitUuid: setup.commit.uuid,
    }
  })

  let mockJob: Job<RunBatchEvaluationJobParams>

  describe('with V2 dataset', () => {
    let dataset: DatasetV2

    beforeEach(async () => {
      vi.clearAllMocks()

      dataset = await factories
        .createDatasetV2({
          disk: testDrive,
          workspace: setup.workspace,
          author: setup.user,
          hashAlgorithm: identityHashAlgorithm,
          fileContent: `
        age,name,surname
        29,Paco,Merlo
        48,Frank,Merlo
        50,John,Doe
      `,
        })
        .then((r) => r.dataset)

      // @ts-ignore
      commonJobData = {
        ...commonJobData,
        dataset,
        // Parameters and map
        parametersMap: { name: 1, secondName: 2 },
        fromLine: 0,
        toLine: 3,
      }
    })

    it.skip('should setup jobs', async () => {
      await runBatchEvaluationJob(buildFakeJob(commonJobData))

      expect(setupQueuesSpy).toHaveBeenCalled()
    })

    it.skip('should use provided batchId', async () => {
      const batchId = randomUUID()
      const job = buildFakeJob(commonJobData)
      job.data.batchId = batchId

      await runBatchEvaluationJob(job)

      expect(
        vi.mocked(
          mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
        ),
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId,
          version: 'v1',
        }),
      )
    })

    it.skip('should emit first run evalution message', async () => {
      await runBatchEvaluationJob(buildFakeJob(commonJobData))

      expect(websocketClientSpy).toHaveBeenCalled()
      expect(mocks.websockets.emit).toHaveBeenCalledWith('evaluationStatus', {
        workspaceId: setup.workspace.id,
        data: {
          batchId: expect.any(String),
          evaluationId: 1,
          documentUuid: setup.documents[0]!.documentUuid,
          enqueued: 0,
          total: 3,
          completed: 0,
          version: 'v1',
        },
      })
    })

    it.skip('should initialize progress on first attempt', async () => {
      await runBatchEvaluationJob(buildFakeJob(commonJobData))

      expect(progressTrackerSpy.initializeProgress).toHaveBeenCalledWith(3)
    })

    it.skip('should not initialize progress on retry attempts', async () => {
      const job = buildFakeJob(commonJobData)
      job.attemptsMade = 1
      await runBatchEvaluationJob(job)

      expect(progressTrackerSpy.initializeProgress).not.toHaveBeenCalled()
    })

    it.skip('should resume from last enqueued job on retry', async () => {
      const job = buildFakeJob(commonJobData)
      job.attemptsMade = 1
      // @ts-ignore
      progressTrackerSpy.getProgress.mockResolvedValueOnce({ enqueued: 2 })

      await runBatchEvaluationJob(job)

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
          parameters: { name: '"John"', secondName: '"Doe"' },
          version: 'v1',
        }),
      )
    })

    it.skip('should process all rows and enqueue jobs', async () => {
      const job = buildFakeJob(commonJobData)
      await runBatchEvaluationJob(job)

      const runDocumentForEvaluationMock =
        mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob
      expect(runDocumentForEvaluationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: expect.any(String),
          evaluationId: 1,
          workspaceId: setup.workspace.id,
          documentUuid: setup.documents[0]!.documentUuid,
          parameters: { name: '"Paco"', secondName: '"Merlo"' },
          version: 'v1',
        }),
      )
      expect(runDocumentForEvaluationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: { name: '"Frank"', secondName: '"Merlo"' },
        }),
      )
      expect(runDocumentForEvaluationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: { name: '"John"', secondName: '"Doe"' },
        }),
      )
    })

    it.skip('should use provided fromLine and toLine', async () => {
      const job = buildFakeJob({
        ...commonJobData,
        fromLine: 2,
        toLine: 3,
      })

      await runBatchEvaluationJob(job)

      expect(
        vi.mocked(
          mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
        ),
      ).toHaveBeenCalledTimes(2)
    })
  })

  describe('with V1 dataset (DEPRECATED)', () => {
    beforeEach(() => {
      vi.clearAllMocks()

      // @ts-ignore
      mockJob = buildFakeJob({
        ...commonJobData,
        dataset: { fileMetadata: { rowCount: 3 } } as unknown as Dataset,
        parametersMap: { param1: 0, param2: 1 },
      })
    })

    it.skip('should process all rows and enqueue jobs', async () => {
      await runBatchEvaluationJob(mockJob)

      expect(
        mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
      ).toHaveBeenCalledTimes(3)
      expect(
        mocks.queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: setup.workspace.id,
          parameters: { param1: 'value1', param2: 'value2' },
          evaluationId: 1,
          batchId: expect.any(String),
          version: 'v1',
        }),
      )
    })

    it.skip('should use provided fromLine and toLine', async () => {
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
  })
})
