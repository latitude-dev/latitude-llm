import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunErrorCodes } from '@latitude-data/constants/errors'
import {
  Commit,
  Dataset,
  DatasetRow,
  Experiment,
  ProviderLog,
  Workspace,
} from '../../../browser'
import { EvaluationV2, Providers } from '../../../constants'
import { Result } from '../../../lib/Result'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { UnprocessableEntityError } from '../../../lib/errors'
import * as evaluationsV2 from '../../../services/evaluationsV2/run'
import serializeProviderLog from '../../../services/providerLogs/serialize'
import * as factories from '../../../tests/factories'
import * as websockets from '../../../websockets/workers'
import * as progressTracker from '../../utils/progressTracker'
import {
  runEvaluationV2Job,
  type RunEvaluationV2JobData,
} from './runEvaluationJob'

vi.mock('../../../redis', () => ({
  buildRedisConnection: vi.fn().mockResolvedValue({}),
}))

const runEvaluationV2Spy = vi.spyOn(evaluationsV2, 'runEvaluationV2')

const mockEmit = vi.fn()
vi.spyOn(websockets.WebsocketClient, 'getSocket').mockResolvedValue({
  emit: mockEmit,
} as any)

// Spy on ProgressTracker
const incrementCompletedSpy = vi.fn()
const incrementFailedSpy = vi.fn()
const incrementErrorsSpy = vi.fn()
const incrementTotalScoreSpy = vi.fn()
vi.spyOn(progressTracker, 'ProgressTracker').mockImplementation(() => ({
  incrementCompleted: incrementCompletedSpy,
  incrementFailed: incrementFailedSpy,
  incrementErrors: incrementErrorsSpy,
  incrementTotalScore: incrementTotalScoreSpy,
  // @ts-expect-error - mock
  getProgress: vi.fn(() => Promise.resolve({ completed: 1, total: 1 })),
  cleanup: vi.fn(),
}))

let jobData: Job<RunEvaluationV2JobData>

function buildJobData(
  data: Partial<RunEvaluationV2JobData>,
): RunEvaluationV2JobData {
  return {
    workspaceId: data.workspaceId || 1,
    commitId: data.commitId || 1,
    evaluationUuid: data.evaluationUuid || 'eval-uuid',
    providerLogUuid: data.providerLogUuid || 'log-uuid',
    experimentUuid: data.experimentUuid,
    datasetId: data.datasetId,
    datasetLabel: data.datasetLabel,
    datasetRowId: data.datasetRowId,
    batchId: data.batchId || 'batch-123',
  }
}

let workspace: Workspace
let documentUuid: string
let providerLog: ProviderLog
let evaluation: EvaluationV2
let experiment: Experiment
let dataset: Dataset
let datasetRow: DatasetRow
let commit: Commit

describe('runEvaluationV2Job', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const setup = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo',
        }),
      },
    })
    workspace = setup.workspace
    const documentVersion = setup.documents[0]!
    const { documentLog: docLog } = await factories.createDocumentLog({
      document: documentVersion,
      commit: setup.commit,
    })
    const pl = await factories.createProviderLog({
      workspace: setup.workspace,
      providerId: setup.providers[0]!.id,
      providerType: setup.providers[0]!.provider,
      documentLogUuid: docLog.uuid,
    })
    const evalV2 = await factories.createEvaluationV2({
      document: documentVersion,
      commit: setup.commit,
      workspace: setup.workspace,
    })
    const { experiment: exp, dataset: ds } = await factories.createExperiment({
      name: 'Test Experiment',
      user: setup.user,
      document: documentVersion,
      commit: setup.commit,
      evaluations: [evalV2],
      workspace: setup.workspace,
    })
    const dsRow = await factories.createDatasetRow({
      workspace: setup.workspace,
      dataset: ds,
      columns: ds.columns,
      rowData: {
        input1: 'value1',
        input2: 'value2',
      },
    })

    commit = setup.commit
    evaluation = evalV2
    experiment = exp
    dataset = ds
    datasetRow = dsRow
    documentUuid = documentVersion.documentUuid
    providerLog = pl
  })

  describe('with valid data', () => {
    beforeEach(async () => {
      jobData = {
        id: '1',
        data: buildJobData({
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          providerLogUuid: providerLog.uuid,
          experimentUuid: experiment.uuid,
          datasetId: dataset.id,
          datasetLabel: 'test',
          datasetRowId: datasetRow.id,
        }),
      } as Job<RunEvaluationV2JobData>
    })

    it('calls runEvaluationV2', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        // @ts-expect-error - mock
        Result.ok({
          result: {
            hasPassed: true,
            normalizedScore: 1,
            error: null,
          },
        }),
      )

      await runEvaluationV2Job(jobData)

      expect(runEvaluationV2Spy).toHaveBeenCalled()
    })

    it('increments completed counter and score when evaluation passes', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        // @ts-expect-error - mock
        Result.ok({
          result: {
            hasPassed: true,
            normalizedScore: 0.8,
            error: null,
          },
        }),
      )

      await runEvaluationV2Job(jobData)

      expect(incrementCompletedSpy).toHaveBeenCalledTimes(2) // 1 for batchId and 1 for experiment
      expect(incrementTotalScoreSpy).toHaveBeenCalledWith(0.8)
      expect(mockEmit).toHaveBeenCalledWith('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId: 'batch-123',
          commitId: commit.id,
          documentUuid,
          evaluationUuid: evaluation.uuid,
          completed: 1,
          total: 1,
          version: 'v2',
        },
      })
    })

    it('increments failed counter when evaluation fails', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        // @ts-expect-error - mock
        Result.ok({
          result: {
            hasPassed: false,
            normalizedScore: 0,
            error: null,
          },
        }),
      )

      await runEvaluationV2Job(jobData)

      expect(incrementFailedSpy).toHaveBeenCalledTimes(1)
      expect(incrementTotalScoreSpy).not.toHaveBeenCalled()
    })

    it('increments error counter when evaluation errors', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        Result.error(
          new UnprocessableEntityError(
            'Cannot evaluate a log that does not end with an assistant message',
          ),
        ),
      )

      await runEvaluationV2Job(jobData)

      expect(incrementErrorsSpy).toHaveBeenCalledTimes(1)
    })

    it('retries on rate limit error', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        Result.error(
          new ChainError({
            code: RunErrorCodes.RateLimit,
            message: 'Rate limit exceeded',
          }),
        ),
      )

      await expect(runEvaluationV2Job(jobData)).rejects.toThrowError(
        new ChainError({
          code: RunErrorCodes.RateLimit,
          message: 'Rate limit exceeded',
        }),
      )
    })
  })

  describe('without experiment', () => {
    beforeEach(async () => {
      jobData = {
        id: '1{bc',
        data: {
          ...buildJobData({
            workspaceId: workspace.id,
            commitId: commit.id,
            evaluationUuid: evaluation.uuid,
            providerLogUuid: providerLog.uuid,
            datasetId: dataset.id,
            datasetLabel: 'test',
            datasetRowId: datasetRow.id,
          }),
          batchId: undefined,
        },
      } as Job<RunEvaluationV2JobData>
    })

    it('runs evaluation without updating experiment progress', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        // @ts-expect-error - mock
        Result.ok({
          result: {
            hasPassed: true,
            normalizedScore: 1,
            error: null,
          },
        }),
      )

      await runEvaluationV2Job(jobData)

      expect(runEvaluationV2Spy).toHaveBeenCalledWith({
        evaluation: {
          ...evaluation,
          updatedAt: expect.any(Date),
        },
        providerLog: {
          ...serializeProviderLog(providerLog),
          updatedAt: expect.any(Date),
        },
        experiment: undefined,
        dataset: {
          ...dataset,
          updatedAt: expect.any(Date),
        },
        datasetLabel: 'test',
        datasetRow: {
          ...datasetRow,
          updatedAt: expect.any(Date),
        },
        commit: {
          ...commit,
          updatedAt: expect.any(Date),
        },
        workspace,
      })
      expect(incrementCompletedSpy).not.toHaveBeenCalled()
      expect(incrementTotalScoreSpy).not.toHaveBeenCalled()
    })
  })

  describe('with invalid data', () => {
    it('throws error if workspace not found', async () => {
      jobData = {
        id: '1',
        data: buildJobData({
          workspaceId: 999999,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          providerLogUuid: providerLog.uuid,
        }),
      } as Job<RunEvaluationV2JobData>

      await expect(runEvaluationV2Job(jobData)).rejects.toThrow(
        'Workspace not found',
      )
    })
  })
})
