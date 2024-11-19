import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DocumentLog,
  ErrorableEntity,
  EvaluationDto,
  ProviderLog,
  Providers,
  Workspace,
} from '../../../browser'
import {
  createDocumentLog,
  createEvaluationResult,
  createLlmAsJudgeEvaluation,
  createProject,
  createProviderLog,
  helpers,
} from '../../../tests/factories'
import { createRunError } from '../../../tests/factories/runErrors'
import { EvaluationResultsWithErrorsRepository } from './index'

let workspace: Workspace
let documentLog: DocumentLog
let evaluatedProviderLog: ProviderLog
let evaluation: EvaluationDto

async function createEvaluationResultWithError({
  documentLog,
  evaluatedProviderLog,
  evaluation,
  result,
}: {
  documentLog: DocumentLog
  evaluatedProviderLog: ProviderLog
  evaluation: EvaluationDto
  result?: string | undefined
}) {
  const { evaluationResult } = await createEvaluationResult({
    documentLog,
    evaluatedProviderLog,
    evaluation,
    result,
    skipEvaluationResultCreation: result === undefined,
  })
  await createRunError({
    errorableType: ErrorableEntity.EvaluationResult,
    errorableUuid: evaluationResult.uuid,
    code: RunErrorCodes.Unknown,
    message: 'Error message',
  })
}
describe('EvaluationResultsRepository', () => {
  describe('findAll', () => {
    beforeEach(async () => {
      const {
        workspace: wps,
        documents: [doc],
        commit: commit1,
        user,
      } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          foo: helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })
      workspace = wps
      const document = doc!
      const { documentLog: docLog, providerLogs } = await createDocumentLog({
        document,
        commit: commit1,
      })
      documentLog = docLog
      evaluatedProviderLog = providerLogs[0]!
      evaluation = await createLlmAsJudgeEvaluation({
        user: user,
        workspace: workspace,
      })
    })

    it('returns evaluation results scoped by workspace', async () => {
      const {
        workspace: workspace2,
        user: user2,
        documents: [document2],
        commit: commit2,
        providers: [provider2],
      } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          bar: helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })

      const evaluation2 = await createLlmAsJudgeEvaluation({
        user: user2,
        workspace: workspace2,
      })

      const documentLog2 = await createDocumentLog({
        document: document2!,
        commit: commit2,
      })

      await createProviderLog({
        workspace,
        documentLogUuid: documentLog2.documentLog.uuid,
        providerId: provider2!.id,
        providerType: Providers.OpenAI,
      })

      const { evaluationResult: evaluationResult2 } =
        await createEvaluationResult({
          documentLog: documentLog2.documentLog,
          evaluatedProviderLog: documentLog2.providerLogs[0]!,
          evaluation: evaluation2,
          result: 'Result 2',
        })
      await createRunError({
        errorableType: ErrorableEntity.EvaluationResult,
        errorableUuid: evaluationResult2.uuid,
        code: RunErrorCodes.Unknown,
        message: 'Error message',
      })

      await createEvaluationResultWithError({
        documentLog,
        evaluatedProviderLog,
        evaluation,
        result: 'Result 1',
      })

      const repo = new EvaluationResultsWithErrorsRepository(workspace.id)
      const results = await repo.findAll()
      const data = results.unwrap()

      expect(results.ok).toBe(true)
      expect(data.length).toBe(1)
      expect(data[0]?.result).toBe('Result 1')
    })

    it('show evaluation result without result', async () => {
      await createEvaluationResultWithError({
        documentLog,
        evaluatedProviderLog,
        evaluation,
      })

      const repo = new EvaluationResultsWithErrorsRepository(workspace.id)
      const results = await repo.findAll()
      const data = results.unwrap()
      expect(results.ok).toBe(true)
      expect(data.length).toBe(1)
      expect(data[0]).toEqual(
        expect.objectContaining({
          error: {
            code: RunErrorCodes.Unknown,
            message: 'Error message',
            details: {
              errorCode: RunErrorCodes.Unknown,
            },
          },
          evaluationId: evaluation.id,
          documentLogId: documentLog.id,
          resultableId: null,
          resultableType: null,
        }),
      )
    })

    it('does return evaluation results with out errors', async () => {
      await createEvaluationResultWithError({
        documentLog,
        evaluatedProviderLog,
        evaluation,
        result: 'Result 1',
      })

      await createEvaluationResult({
        documentLog,
        evaluatedProviderLog,
        evaluation,
        result: 'Result 2',
      })

      const repo = new EvaluationResultsWithErrorsRepository(workspace.id)
      const results = await repo.findAll()
      const data = results.unwrap()

      expect(results.ok).toBe(true)
      expect(data.length).toBe(2)
    })
  })
})
