import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DocumentLog,
  ErrorableEntity,
  EvaluationDto,
  ProviderLog,
  Providers,
  Workspace,
} from '../../browser'
import {
  createDocumentLog,
  createEvaluationResult,
  createLlmAsJudgeEvaluation,
  createProject,
  createProviderLog,
  helpers,
} from '../../tests/factories'
import { createRunError } from '../../tests/factories/runErrors'
import { EvaluationResultsRepository } from './index'

let workspace: Workspace
let documentLog: DocumentLog
let providerLogs: ProviderLog[]
let evaluation: EvaluationDto

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
      const { documentLog: docLog, providerLogs: pls } =
        await createDocumentLog({
          document,
          commit: commit1,
        })
      documentLog = docLog
      providerLogs = pls
      evaluation = await createLlmAsJudgeEvaluation({
        user: user,
        workspace: workspace,
      })

      await createEvaluationResult({
        documentLog,
        evaluatedProviderLog: providerLogs[0]!,
        evaluation,
        result: 'Result 1',
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

      const { documentLog: documentLog2, providerLogs: providerLogs2 } =
        await createDocumentLog({
          document: document2!,
          commit: commit2,
        })

      await createProviderLog({
        workspace,
        documentLogUuid: documentLog2.uuid,
        providerId: provider2!.id,
        providerType: Providers.OpenAI,
      })

      await createEvaluationResult({
        documentLog: documentLog2,
        evaluatedProviderLog: providerLogs2[0]!,
        evaluation: evaluation2,
        result: 'Result 2',
      })

      const repo = new EvaluationResultsRepository(workspace.id)
      const results = await repo.findAll()
      const data = results.unwrap()

      expect(results.ok).toBe(true)
      expect(data.length).toBe(1)
      expect(data[0]?.result).toBe('Result 1')
    })

    it('does not return evaluation results with errors', async () => {
      const { evaluationResult } = await createEvaluationResult({
        documentLog,
        evaluatedProviderLog: providerLogs[0]!,
        evaluation,
        result: 'Result 2',
      })
      await createRunError({
        errorableType: ErrorableEntity.EvaluationResult,
        errorableUuid: evaluationResult.uuid,
        code: RunErrorCodes.Unknown,
        message: 'Error message',
      })

      const repo = new EvaluationResultsRepository(workspace.id)
      const results = await repo.findAll()
      const data = results.unwrap()

      expect(results.ok).toBe(true)
      expect(data.length).toBe(1)
      expect(data[0]?.result).toBe('Result 1')
    })

    it('filter evaluation results without result', async () => {
      await createEvaluationResult({
        documentLog,
        evaluatedProviderLog: providerLogs[0]!,
        evaluation,
        skipEvaluationResultCreation: true,
      })

      const repo = new EvaluationResultsRepository(workspace.id)
      const results = await repo.findAll()
      const data = results.unwrap()

      expect(results.ok).toBe(true)
      expect(data.length).toBe(1)
      expect(data[0]?.result).toBe('Result 1')
    })
  })
})
