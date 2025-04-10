import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dataset, EvaluationDto, Providers } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { type FactoryCreateProjectReturn } from '@latitude-data/core/factories'

import { runBatchEvaluationAction } from './runBatch'
import { evaluationsQueue, eventsQueue } from '@latitude-data/core/queues'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  queues: {
    evaluationsQueue: vi.fn(),
    eventsQueue: vi.fn(),
  },
}))

vi.spyOn(evaluationsQueue, 'add').mockImplementation(
  mocks.queues.evaluationsQueue,
)
vi.spyOn(eventsQueue, 'add').mockImplementation(mocks.queues.eventsQueue)

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

let setup: FactoryCreateProjectReturn
let evaluation: EvaluationDto
describe('runBatchAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const [_, error] = await runBatchEvaluationAction({
        datasetId: 1,
        projectId: 1,
        documentUuid: 'doc-uuid',
        commitUuid: 'commit-uuid',
        fromLine: 0,
        toLine: 5,
        evaluationIds: [1],
        autoRespondToolCalls: true,
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    beforeAll(async () => {
      setup = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          'test-doc': factories.helpers.createPrompt({
            provider: 'openai',
            content:
              'This is a test document using parameters: {{age}} and {{name}}',
          }),
        },
      })

      evaluation = await factories.createLlmAsJudgeEvaluation({
        user: setup.user,
        workspace: setup.workspace,
        name: 'Test Evaluation',
      })

      mocks.getSession.mockReturnValue({
        user: setup.user,
        workspace: setup.workspace,
      })
    })

    describe('with dataset V2', () => {
      let dataset: Dataset

      beforeEach(async () => {
        vi.clearAllMocks()

        dataset = await factories
          .createDataset({
            workspace: setup.workspace,
            author: setup.user,
            fileContent: `
        age,name,surname
        29,Paco,Merlo
        48,Frank,Merlo
        50,John,Doe
      `,
          })
          .then((r) => r.dataset)
      })

      it('handles errors when resources are not found', async () => {
        const [_, error] = await runBatchEvaluationAction({
          datasetId: 999999,
          projectId: setup.project.id,
          documentUuid: setup.documents[0]!.documentUuid,
          commitUuid: setup.commit.uuid,
          fromLine: 0,
          toLine: 5,
          parameters: { age: 1 },
          evaluationIds: [evaluation.id],
          autoRespondToolCalls: true,
        })

        expect(error).not.toBeNull()
        expect(error!.message).toContain('not found')
      })

      it('handles optional parameters', async () => {
        const [result, error] = await runBatchEvaluationAction({
          datasetId: dataset.id,
          projectId: setup.project.id,
          documentUuid: setup.documents[0]!.documentUuid,
          commitUuid: setup.commit.uuid,
          fromLine: 10,
          toLine: 20,
          evaluationIds: [evaluation.id],
          parameters: { age: 1, name: 2 },
          autoRespondToolCalls: true,
        })

        expect(error).toBeNull()
        expect(result).toEqual({
          success: true,
        })

        expect(mocks.queues.evaluationsQueue).toHaveBeenCalledWith(
          'runBatchEvaluationJob',
          expect.objectContaining({
            fromLine: 10,
            toLine: 20,
            parametersMap: { age: 1, name: 2 },
          }),
        )
      })

      it('fails when doc has not parameters and parameters are passed', async () => {
        const [_result, error] = await runBatchEvaluationAction({
          datasetId: dataset.id,
          projectId: setup.project.id,
          documentUuid: setup.documents[0]!.documentUuid,
          commitUuid: setup.commit.uuid,
          fromLine: 0,
          toLine: 5,
          parameters: { noColumn: 1 },
          evaluationIds: [evaluation.id],
          autoRespondToolCalls: true,
        })

        expect(error?.fieldErrors).toEqual({
          parameters: [
            'age: Is not present in the parameters list',
            'age: Has not a valid header assigned in this dataset. If you want to keep empty this parameter choose "Leave empty in that parameter"',
            'name: Is not present in the parameters list',
            'name: Has not a valid header assigned in this dataset. If you want to keep empty this parameter choose "Leave empty in that parameter"',
          ],
        })
      })

      it('successfully enqueues a batch evaluation job', async () => {
        const [result, error] = await runBatchEvaluationAction({
          datasetId: dataset.id,
          projectId: setup.project.id,
          documentUuid: setup.documents[0]!.documentUuid,
          commitUuid: setup.commit.uuid,
          fromLine: 0,
          toLine: 5,
          parameters: { age: 1, name: 2 },
          evaluationIds: [evaluation.id],
          autoRespondToolCalls: true,
        })

        expect(error).toBeNull()
        expect(result).toEqual({
          success: true,
        })

        expect(mocks.queues.evaluationsQueue).toHaveBeenCalledWith(
          'runBatchEvaluationJob',
          expect.objectContaining({
            evaluation: expect.objectContaining({ id: evaluation.id }),
            dataset: expect.objectContaining({ id: dataset.id }),
            document: expect.objectContaining({
              documentUuid: setup.documents[0]!.documentUuid,
            }),
            fromLine: 0,
            toLine: 5,
            parametersMap: { age: 1, name: 2 },
            batchId: expect.any(String),
          }),
        )
      })

      it('enqueues multiple evaluation jobs for multiple evaluationIds', async () => {
        const evaluation2 = await factories.createLlmAsJudgeEvaluation({
          user: setup.user,
          workspace: setup.workspace,
          name: 'Test Evaluation 2',
        })

        const [result, error] = await runBatchEvaluationAction({
          datasetId: dataset.id,
          projectId: setup.project.id,
          documentUuid: setup.documents[0]!.documentUuid,
          commitUuid: setup.commit.uuid,
          fromLine: 0,
          toLine: 5,
          parameters: { age: 1, name: 2 },
          evaluationIds: [evaluation.id, evaluation2.id],
          autoRespondToolCalls: true,
        })

        expect(error).toBeNull()
        expect(result).toEqual({
          success: true,
        })

        expect(mocks.queues.evaluationsQueue).toHaveBeenCalledTimes(2)

        expect(mocks.queues.evaluationsQueue).toHaveBeenCalledWith(
          'runBatchEvaluationJob',
          expect.objectContaining({
            evaluation: expect.objectContaining({ id: evaluation.id }),
          }),
        )

        expect(mocks.queues.evaluationsQueue).toHaveBeenCalledWith(
          'runBatchEvaluationJob',
          expect.objectContaining({
            evaluation: expect.objectContaining({ id: evaluation2.id }),
          }),
        )
      })
    })
  })
})
