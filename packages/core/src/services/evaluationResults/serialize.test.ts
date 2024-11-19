import { beforeAll, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentLog,
  DocumentVersion,
  EvaluationMetadataType,
  EvaluationResultableType,
  ProviderLog,
  Providers,
  SerializedDocumentLog,
  User,
  Workspace,
} from '../../browser'
import {
  EvaluationResultsRepository,
  EvaluationsRepository,
  ProviderLogsRepository,
} from '../../repositories'
import * as factories from '../../tests/factories'
import { serializeForEvaluation as serializeProviderLog } from '../providerLogs'
import { serialize } from './serialize'

describe('serialize', () => {
  let workspace: Workspace
  let user: User
  let document: DocumentVersion
  let commit: Commit
  let documentLog: DocumentLog
  let documentProviderLogInput: ProviderLog
  let evaluatedLog: SerializedDocumentLog

  describe('when an string or array of strings', () => {
    beforeAll(async () => {
      const setup = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: factories.helpers.createPrompt({
            provider: 'openai',
            content: 'foo',
          }),
        },
      })
      workspace = setup.workspace
      user = setup.user
      document = setup.documents[0]!
      commit = setup.commit
      const { documentLog: dl, providerLogs } =
        await factories.createDocumentLog({
          document,
          commit,
        })
      documentLog = dl
      documentProviderLogInput = providerLogs.pop()!
      const serializedDocumentProviderLog = serializeProviderLog(
        documentProviderLogInput,
      )
      evaluatedLog = {
        ...serializedDocumentProviderLog,
        parameters: documentLog.parameters,
        prompt: documentLog.resolvedContent,
        duration: documentLog.duration,
        cost: documentProviderLogInput.costInMillicents / 1000,
      }
    })

    it('serialize a llm as judge evaluation result', async () => {
      const judgeLlmEvaluation = await factories.createLlmAsJudgeEvaluation({
        workspace,
        user,
      })
      const evaluationRepo = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationRepo
        .find(judgeLlmEvaluation.id)
        .then((r) => r.unwrap())

      // Evaluation Result
      const { evaluationResult: er } = await factories.createEvaluationResult({
        evaluation,
        documentLog,
        evaluatedProviderLog: documentProviderLogInput,
        reason: 'Por que si',
        result: 'yes',
      })

      const evaluationResRepo = new EvaluationResultsRepository(workspace.id)
      const evaluationResult = await evaluationResRepo
        .find(er.id)
        .then((r) => r.unwrap())

      const providerLogRepo = new ProviderLogsRepository(workspace.id)

      // Evaluation Provider Log
      const evaluationProviderLog = await providerLogRepo
        .find(evaluationResult.evaluationProviderLogId)
        .then((r) => r.unwrap())
      const serialzedEvaluationProviderLog = serializeProviderLog(
        evaluationProviderLog,
      )

      const data = await serialize({ workspace, evaluationResult }).then((r) =>
        r.unwrap(),
      )
      expect(data).toEqual({
        ...serialzedEvaluationProviderLog,
        evaluatedLog,
        resultableType: EvaluationResultableType.Text,
        reason: 'Por que si',
        result: 'yes',
      })
    })

    it('serialize a manual evaluation result', async () => {
      const manualEvaluation = await factories.createEvaluation({
        workspace,
        user,
        metadataType: EvaluationMetadataType.Manual,
        resultType: EvaluationResultableType.Boolean,
        resultConfiguration: {
          trueValueDescription: 'Test true value description',
          falseValueDescription: 'Test false value description',
        },
      })

      // Evaluation Result
      const { evaluationResult: er } = await factories.createEvaluationResult({
        evaluation: manualEvaluation,
        documentLog,
        evaluatedProviderLog: documentProviderLogInput,
        reason: 'Por que si carajo!, I am a human',
        result: 'false',
      })

      const evaluationResRepo = new EvaluationResultsRepository(workspace.id)
      const evaluationResult = await evaluationResRepo
        .find(er.id)
        .then((r) => r.unwrap())

      const data = await serialize({ workspace, evaluationResult }).then((r) =>
        r.unwrap(),
      )

      expect(data).toEqual({
        evaluatedLog,
        resultableType: EvaluationResultableType.Boolean,
        reason: 'Por que si carajo!, I am a human',
        result: 'false',
      })
    })
  })
})
