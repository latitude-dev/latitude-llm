import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentLog, EvaluationDto, Workspace } from '../../../browser'
import { Providers, RunErrorCodes } from '../../../constants'
import { Result } from '../../../lib'
import * as queues from '../../../queues'
import { EvaluationsRepository } from '../../../repositories'
import { ChainError } from '../../../services/chains/ChainErrors'
import { ChainResponse } from '../../../services/chains/run'
import * as evaluations from '../../../services/evaluations/run'
import * as factories from '../../../tests/factories'
import * as websockets from '../../../websockets/workers'
import * as progressTracker from '../../utils/progressTracker'
import { runEvaluationJob, type RunEvaluationJobData } from './runEvaluationJob'

// @ts-ignore
vi.spyOn(queues, 'queues').mockResolvedValue({})
const runEvaluationSpy = vi.spyOn(evaluations, 'runEvaluation')

const FAKE_ERRORABLE_UUID = '12345678-1234-1234-1234-123456789012'
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue({ type: 'text', text: 'foo' })
    controller.close()
  },
})
const mockEmit = vi.fn()
// @ts-ignore
vi.spyOn(websockets.WebsocketClient, 'getSocket').mockResolvedValue({
  emit: mockEmit,
})

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

function buildJobData(
  data: Partial<RunEvaluationJobData>,
): RunEvaluationJobData {
  return {
    workspaceId: data.workspaceId || 1,
    documentUuid: data.documentUuid || 'doc-uuid',
    documentLogUuid: data.documentLogUuid || 'log-uuid',
    evaluationId: data.evaluationId || 2,
    batchId: 'batch-123',
  }
}
let workspace: Workspace
let documentUuid: string
let documentLog: DocumentLog
let evaluation: EvaluationDto
let runChainResponse: ChainResponse<'object'>

describe('runEvaluationJob', () => {
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
    const llmEval = await factories.createLlmAsJudgeEvaluation({
      user: setup.user,
      workspace: setup.workspace,
      name: 'Test Evaluation',
    })
    const evaluationsScope = new EvaluationsRepository(workspace.id)

    evaluation = await evaluationsScope.find(llmEval.id).then((r) => r.unwrap())
    documentUuid = documentVersion.documentUuid
    documentLog = docLog
  })

  describe('with valid data', () => {
    beforeEach(async () => {
      jobData = {
        id: '1',
        data: buildJobData({
          workspaceId: workspace.id,
          documentUuid,
          documentLogUuid: documentLog.uuid,
          evaluationId: evaluation.id,
        }),
      } as Job<RunEvaluationJobData>
    })

    it('calls runEvaluation', async () => {
      await runEvaluationJob(jobData)
      expect(runEvaluationSpy).toHaveBeenCalledWith({
        documentLog: {
          ...documentLog,
          error: {
            code: null,
            message: null,
            details: null,
          },
        },
        evaluation,
        documentUuid: documentUuid,
      })
    })

    it('increment successful counter', async () => {
      runChainResponse = Result.ok({
        streamType: 'object' as 'object',
        object: { result: { result: '42', reason: 'Is always 42' } },
        text: 'chain resolved text',
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
        documentLogUuid: documentLog.uuid,
        providerLog: undefined,
      })
      runEvaluationSpy.mockResolvedValueOnce(
        Result.ok({
          stream,
          response: new Promise((resolve) => resolve(runChainResponse)),
          resolvedContent: 'chain resolved text',
          errorableUuid: FAKE_ERRORABLE_UUID,
          duration: new Promise((resolve) => resolve(1000)),
        }),
      )
      await runEvaluationJob(jobData)

      expect(websockets.WebsocketClient.getSocket).toHaveBeenCalledTimes(1)
      expect(incrementCompletedSpy).toHaveBeenCalledTimes(1)
      expect(mockEmit).toHaveBeenCalledWith('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId: 'batch-123',
          evaluationId: evaluation.id,
          documentUuid,
          completed: 1,
          total: 1,
        },
      })
    })

    it('increment error counter', async () => {
      runEvaluationSpy.mockResolvedValueOnce(
        Result.error(
          new ChainError({
            code: RunErrorCodes.EvaluationRunResponseJsonFormatError,
            message: 'malformed json response',
          }),
        ),
      )

      await runEvaluationJob(jobData)

      expect(websockets.WebsocketClient.getSocket).toHaveBeenCalledTimes(1)
      expect(incrementErrorsSpy).toHaveBeenCalledTimes(1)
      expect(mockEmit).toHaveBeenCalledWith('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId: 'batch-123',
          evaluationId: evaluation.id,
          documentUuid,
          completed: 1,
          total: 1,
        },
      })
    })

    it('increment error counter when response has an error', async () => {
      runChainResponse = Result.error(
        new ChainError({
          code: RunErrorCodes.EvaluationRunResponseJsonFormatError,
          message: 'malformed json response',
        }),
      )
      runEvaluationSpy.mockResolvedValueOnce(
        Result.ok({
          stream,
          response: new Promise((resolve) => resolve(runChainResponse)),
          resolvedContent: 'chain resolved text',
          errorableUuid: FAKE_ERRORABLE_UUID,
          duration: new Promise((resolve) => resolve(1000)),
        }),
      )

      await runEvaluationJob(jobData)

      expect(websockets.WebsocketClient.getSocket).toHaveBeenCalledTimes(1)
      expect(incrementErrorsSpy).toHaveBeenCalledTimes(1)
      expect(mockEmit).toHaveBeenCalledWith('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId: 'batch-123',
          evaluationId: evaluation.id,
          documentUuid,
          completed: 1,
          total: 1,
        },
      })
    })

    it('throws an error if runEvaluation fails', async () => {
      runEvaluationSpy.mockRejectedValue(new Error('Some error'))

      await expect(runEvaluationJob(jobData)).rejects.toThrowError(
        new Error('Some error'),
      )
    })

    it('throws an error when runEvaluation fails with a ChainError.Unknown', async () => {
      runEvaluationSpy.mockResolvedValueOnce(
        Result.error(
          new ChainError({
            code: RunErrorCodes.Unknown,
            message: 'We didnt expect this error',
          }),
        ),
      )

      await expect(runEvaluationJob(jobData)).rejects.toThrowError(
        new ChainError({
          code: RunErrorCodes.Unknown,
          message: 'We didnt expect this error',
        }),
      )
    })
  })

  describe('with invalid data', () => {
    it('throws an error if documentLogUuid is invalid', async () => {
      await expect(
        runEvaluationJob({
          id: '1',
          data: buildJobData({
            workspaceId: workspace.id,
            documentUuid,
            documentLogUuid: '12345678-1234-1234-1234-123456789034',
            evaluationId: evaluation.id,
          }),
        } as Job<RunEvaluationJobData>),
      ).rejects.toThrowError(
        new Error(
          'DocumentLog not found with uuid 12345678-1234-1234-1234-123456789034',
        ),
      )
    })
  })
})
