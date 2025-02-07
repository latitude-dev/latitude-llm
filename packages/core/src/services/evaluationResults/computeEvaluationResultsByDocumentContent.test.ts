import { beforeAll, describe, expect, it } from 'vitest'

import { computeEvaluationResultsByDocumentContent } from './index'
import {
  Commit,
  DocumentVersion,
  EvaluationDto,
  User,
  Workspace,
} from '../../browser'
import { EvaluationMetadataType, Providers } from '../../constants'
import { EvaluationResultByDocument } from '../../repositories'
import * as factories from '../../tests/factories'
import { updateDocument } from '../documents'
import { connectEvaluations } from '../evaluations'

async function evaluateDocument({
  commit,
  document,
  evaluation,
  count,
  sameContent,
}: {
  document: DocumentVersion
  commit: Commit
  evaluation: EvaluationDto
  count: number
  sameContent: boolean
}) {
  let results: EvaluationResultByDocument[] = []
  for (let i = 0; i < count; i++) {
    const { documentLog, providerLogs } = await factories.createDocumentLog({
      document,
      commit,
    })

    const { evaluationResult } = await factories.createEvaluationResult({
      documentLog,
      evaluatedProviderLog: providerLogs[0]!,
      evaluation,
    })

    if (evaluationResult) {
      results.push({
        id: evaluationResult.id,
        result: evaluationResult.result,
        createdAt: evaluationResult.createdAt,
        source: evaluationResult.source,
        sameContent,
      })
    }
  }

  return results
}

describe('computeEvaluationResultsByDocumentContent', () => {
  let workspace: Workspace
  let user: User
  let draft: Commit
  let document: DocumentVersion
  let newDocument: DocumentVersion
  let llmAsJudgeEvaluation: EvaluationDto
  let oldDocumentResult: EvaluationResultByDocument
  let manualEvaluation: EvaluationDto

  describe('with different evaluations', async () => {
    beforeAll(async () => {
      const {
        workspace: wsp,
        project,
        evaluations,
        user: usr,
        commit,
        documents,
      } = await factories.createProject({
        providers: [{ name: 'foo', type: Providers.OpenAI }],
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({
              provider: 'foo',
            }),
          },
          {
            metadataType: EvaluationMetadataType.Manual,
          },
        ],
        documents: {
          foo: factories.helpers.createPrompt({
            provider: 'foo',
          }),
        },
      })
      workspace = wsp
      user = usr
      document = documents[0]!
      const { commit: cmtDraft } = await factories.createDraft({
        project,
        user,
      })
      draft = cmtDraft
      llmAsJudgeEvaluation = evaluations[0]!
      manualEvaluation = evaluations[1]!
      newDocument = await updateDocument({
        commit: draft,
        document,
        content: factories.helpers.createPrompt({
          provider: 'foo',
          content: 'foov2',
        }),
      }).then((r) => r.unwrap())
      await connectEvaluations({
        workspace,
        documentUuid: document.documentUuid,
        evaluationUuids: [llmAsJudgeEvaluation.uuid, manualEvaluation.uuid],
        user,
      })
      const oldDocumentResults = await evaluateDocument({
        document,
        commit,
        evaluation: llmAsJudgeEvaluation,
        count: 1,
        sameContent: false,
      })
      oldDocumentResult = oldDocumentResults[0]!
    })

    it('returns all evaluation results', async () => {
      const llmEvaluatedResults = await evaluateDocument({
        document: newDocument,
        commit: draft,
        evaluation: llmAsJudgeEvaluation,
        count: 1,
        sameContent: true,
      })
      const llmEvaluatedResult = llmEvaluatedResults[0]!
      const results = await computeEvaluationResultsByDocumentContent({
        evaluation: llmAsJudgeEvaluation,
        commit: draft,
        documentUuid: document.documentUuid,
      }).then((r) => r.unwrap())

      expect(results).toEqual([
        { ...llmEvaluatedResult, createdAt: expect.any(Date) },
        { ...oldDocumentResult, createdAt: expect.any(Date) },
      ])
    })

    it('returns manual evaluation results', async () => {
      const manualEvaluatedResults = await evaluateDocument({
        document: newDocument,
        commit: draft,
        evaluation: manualEvaluation,
        count: 1,
        sameContent: true,
      })
      const manualEvaluatedResult = manualEvaluatedResults[0]!

      const results = await computeEvaluationResultsByDocumentContent({
        evaluation: manualEvaluation,
        commit: draft,
        documentUuid: document.documentUuid,
      }).then((r) => r.unwrap())

      expect(results).toEqual([
        { ...manualEvaluatedResult, createdAt: expect.any(Date) },
      ])
    })
  })

  it('paginates the results correctly', async () => {
    const { workspace, commit, documents, evaluations, user } =
      await factories.createProject({
        providers: [{ name: 'foo', type: Providers.OpenAI }],
        documents: {
          foo: factories.helpers.createPrompt({
            provider: 'foo',
          }),
        },
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({
              provider: 'foo',
            }),
          },
        ],
      })

    const document = documents[0]!
    const evaluation = evaluations[0]!

    await connectEvaluations({
      workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    await evaluateDocument({
      document,
      commit,
      evaluation,
      count: 2,
      sameContent: true,
    })

    const result = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit,
      documentUuid: document.documentUuid,
    })

    expect(result.ok).toBe(true)

    const firstResult = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit,
      documentUuid: document.documentUuid,
      page: 1,
      pageSize: 1,
    })
    expect(firstResult.ok).toBe(true)
    expect(firstResult.value!.length).toBe(1)
    expect(firstResult.value![0]!.id).toBe(result.value![0]!.id)

    const secondResult = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit,
      documentUuid: document.documentUuid,
      page: 2,
      pageSize: 1,
    })
    expect(secondResult.ok).toBe(true)
    expect(secondResult.value!.length).toBe(1)
    expect(secondResult.value![0]!.id).toBe(result.value![1]!.id)
  })
})
