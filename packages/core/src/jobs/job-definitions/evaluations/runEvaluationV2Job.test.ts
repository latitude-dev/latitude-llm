import { ChainError, RunErrorCodes } from '../../../lib/errors'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DatasetRow } from '../../../schema/models/types/DatasetRow'
import { type Experiment } from '../../../schema/models/types/Experiment'
import { type Workspace } from '../../../schema/models/types/Workspace'
import {
  EvaluationV2,
  Providers,
  Span,
  SpanType,
} from '@latitude-data/constants'
import { Result } from '../../../lib/Result'
import { UnprocessableEntityError } from '../../../lib/errors'
import * as evaluationsV2 from '../../../services/evaluationsV2/run'
import { completeExperiment } from '../../../services/experiments/complete'
import * as factories from '../../../tests/factories'
import { WebsocketClient } from '../../../websockets/workers'
import * as progressTracker from '../../utils/progressTracker'
import {
  runEvaluationV2Job,
  type RunEvaluationV2JobData,
} from './runEvaluationV2Job'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'

vi.mock(import('../../../redis'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildRedisConnection: vi.fn(),
  }
})

const runEvaluationV2Spy = vi.spyOn(evaluationsV2, 'runEvaluationV2')

// Spy on ProgressTracker
const evaluationFinishedSpy = vi.fn()
const evaluationErrorSpy = vi.fn()

vi.spyOn(WebsocketClient, 'sendEvent').mockImplementation(vi.fn())
vi.spyOn(progressTracker, 'ProgressTracker').mockImplementation(() => ({
  evaluationFinished: evaluationFinishedSpy,
  evaluationError: evaluationErrorSpy,
  // @ts-expect-error - mock
  getProgress: vi.fn(() => Promise.resolve({ completed: 1, total: 1 })),
  disconnect: vi.fn().mockReturnValue(Promise.resolve()),
  cleanup: vi.fn().mockReturnValue(Promise.resolve()),
}))

let jobData: Job<RunEvaluationV2JobData>

function buildJobData(
  data: Partial<RunEvaluationV2JobData>,
): RunEvaluationV2JobData {
  return {
    workspaceId: data.workspaceId || 1,
    commitId: data.commitId || 1,
    evaluationUuid: data.evaluationUuid || 'eval-uuid',
    spanId: data.spanId || 'span-id',
    traceId: data.traceId || 'trace-id',
    experimentUuid: data.experimentUuid,
    datasetId: data.datasetId,
    datasetLabel: data.datasetLabel,
    datasetRowId: data.datasetRowId,
  }
}

let workspace: Workspace
let span: Span
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
    const sp = await factories.createSpan({
      workspaceId: setup.workspace.id,
      apiKeyId: setup.apiKeys[0]!.id,
      type: SpanType.Prompt,
      documentUuid: documentVersion.documentUuid,
      commitUuid: setup.commit.uuid,
      documentLogUuid: generateUUIDIdentifier(),
    })

    commit = setup.commit
    evaluation = evalV2
    experiment = exp
    dataset = ds
    datasetRow = dsRow
    span = sp
  })

  describe('with valid data', () => {
    beforeEach(async () => {
      jobData = {
        id: '1',
        data: buildJobData({
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: span.id,
          traceId: span.traceId,
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

      expect(evaluationFinishedSpy).toHaveBeenCalledWith(
        span.documentLogUuid!,
        { passed: true, score: 0.8 },
      )
      expect(evaluationErrorSpy).not.toHaveBeenCalled()
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

      expect(evaluationFinishedSpy).toHaveBeenCalledWith(
        span.documentLogUuid!,
        { passed: false, score: 0 },
      )
      expect(evaluationErrorSpy).not.toHaveBeenCalled()
    })

    it('increments error counter when evaluation errors', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        // @ts-expect-error - mock
        Result.ok({
          result: {
            error: {
              message: 'Evaluation error',
            },
          },
        }),
      )

      await runEvaluationV2Job(jobData)

      expect(evaluationErrorSpy).toHaveBeenCalledWith(span.documentLogUuid!)
      expect(evaluationFinishedSpy).not.toHaveBeenCalled()
    })

    it('increments error counter when evaluation throws', async () => {
      runEvaluationV2Spy.mockResolvedValueOnce(
        Result.error(
          new UnprocessableEntityError(
            'Cannot evaluate a log that does not end with an assistant message',
          ),
        ),
      )

      await runEvaluationV2Job(jobData)

      expect(evaluationErrorSpy).toHaveBeenCalledWith(span.documentLogUuid!)
      expect(evaluationFinishedSpy).not.toHaveBeenCalled()
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

      expect(evaluationFinishedSpy).not.toHaveBeenCalled()
      expect(evaluationErrorSpy).not.toHaveBeenCalled()
    })

    it('does not run evaluation if experiment is finished', async () => {
      await completeExperiment(experiment).then((r) => r.unwrap())
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
      expect(runEvaluationV2Spy).not.toHaveBeenCalled()
      expect(evaluationFinishedSpy).not.toHaveBeenCalled()
      expect(evaluationErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('without experiment', () => {
    beforeEach(async () => {
      jobData = {
        id: '1',
        data: {
          ...buildJobData({
            workspaceId: workspace.id,
            commitId: commit.id,
            evaluationUuid: evaluation.uuid,
            spanId: span.id,
            traceId: span.traceId,
            datasetId: dataset.id,
            datasetLabel: 'test',
            datasetRowId: datasetRow.id,
          }),
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
        span: { ...span, metadata: undefined },
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
      expect(evaluationFinishedSpy).not.toHaveBeenCalled()
      expect(evaluationErrorSpy).not.toHaveBeenCalled()
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
          spanId: span.id,
          traceId: span.traceId,
        }),
      } as Job<RunEvaluationV2JobData>

      await expect(runEvaluationV2Job(jobData)).rejects.toThrow(
        'Workspace not found',
      )
    })
  })
})
