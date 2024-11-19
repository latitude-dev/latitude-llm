import { beforeAll, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentVersion,
  EvaluationDto,
  ProviderApiKey,
  Providers,
  User,
  Workspace,
} from '../../browser'
import {
  EvaluationResultDto,
  EvaluationResultsRepository,
  EvaluationsRepository,
} from '../../repositories'
import * as factories from '../../tests/factories'
import { findManyByIdAndEvaluation } from './findManyByIdAndEvaluation'

describe('findManyByIdAndEvaluation', () => {
  let workspace: Workspace
  let user: User
  let evaluation: EvaluationDto
  let evaluationResult: EvaluationResultDto
  let provider: ProviderApiKey
  let document: DocumentVersion
  let commit: Commit

  beforeAll(async () => {
    const { workspace: wsp, userData } = await factories.createWorkspace()
    workspace = wsp
    user = userData
    const setup = await factories.createProject({
      workspace,
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo',
        }),
      },
    })
    provider = setup.providers[0]!
    document = setup.documents[0]!
    commit = setup.commit
  })

  describe('when undefined', () => {
    it('returns empty values', async () => {
      const result = await findManyByIdAndEvaluation({
        workspace,
        documentUuid: document.documentUuid,
        commit,
        ids: undefined,
      })
      expect(result).toEqual({
        evaluation: undefined,
        evaluationResults: undefined,
      })
    })
  })

  describe('when an string or array of strings', () => {
    beforeAll(async () => {
      const ev = await factories.createLlmAsJudgeEvaluation({
        workspace,
        user,
      })
      const evaluationRepo = new EvaluationsRepository(workspace.id)
      evaluation = await evaluationRepo.find(ev.id).then((r) => r.unwrap())
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })
      const evaluatedProviderLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
      })
      const { evaluationResult: er } = await factories.createEvaluationResult({
        evaluation,
        documentLog,
        evaluatedProviderLog,
        result: 'yes',
      })

      const evaluationResRepo = new EvaluationResultsRepository(workspace.id)
      evaluationResult = await evaluationResRepo
        .find(er.id)
        .then((r) => r.unwrap())
    })

    it('finds evaluation when passed id as string', async () => {
      const result = await findManyByIdAndEvaluation({
        workspace,
        documentUuid: document.documentUuid,
        commit,
        ids: String(evaluationResult.id),
      })
      expect(result).toEqual({
        evaluation,
        evaluationResults: [
          {
            id: evaluationResult.id,
            source: evaluationResult.source,
            result: evaluationResult.result,
            createdAt: evaluationResult.createdAt,
            sameContent: true,
          },
        ],
      })
    })

    it('finds evaluation when passed id as array of string', async () => {
      const result = await findManyByIdAndEvaluation({
        workspace,
        documentUuid: document.documentUuid,
        commit,
        ids: [String(evaluationResult.id)],
      })
      expect(result).toEqual({
        evaluation,
        evaluationResults: [
          {
            id: evaluationResult.id,
            source: evaluationResult.source,
            result: evaluationResult.result,
            createdAt: evaluationResult.createdAt,
            sameContent: true,
          },
        ],
      })
    })

    it('returns nothing if results from different evaluations', async () => {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })
      const ev = await factories.createLlmAsJudgeEvaluation({
        workspace,
        user,
      })
      const evaluationRepo = new EvaluationsRepository(workspace.id)
      const evaluation2 = await evaluationRepo
        .find(ev.id)
        .then((r) => r.unwrap())
      const evaluatedProviderLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
      })
      const { evaluationResult: er } = await factories.createEvaluationResult({
        evaluation: evaluation2,
        documentLog,
        evaluatedProviderLog,
        result: 'yes',
      })
      const evaluationResRepo = new EvaluationResultsRepository(workspace.id)
      const evaluationResult2 = await evaluationResRepo
        .find(er.id)
        .then((r) => r.unwrap())

      const result = await findManyByIdAndEvaluation({
        workspace,
        documentUuid: document.documentUuid,
        commit,
        ids: [String(evaluationResult.id), String(evaluationResult2.id)],
      })
      expect(result).toEqual({
        evaluation: undefined,
        evaluationResults: undefined,
      })
    })
  })
})
