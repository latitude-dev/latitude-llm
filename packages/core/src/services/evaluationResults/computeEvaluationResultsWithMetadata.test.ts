import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentVersion,
  EvaluationDto,
  EvaluationResultDto,
  Providers,
  Workspace,
} from '../../browser'
import * as factories from '../../tests/factories'
import { findEvaluationResultWithMetadataPage } from './computeEvaluationResultsWithMetadata'

describe('findEvaluationResultWithMetadataPage', () => {
  let workspace: Workspace
  let evaluation: EvaluationDto
  let commit: Commit
  let document: DocumentVersion
  let evaluationResults: EvaluationResultDto[]

  beforeEach(async () => {
    const {
      workspace: w,
      providers: ps,
      documents: ds,
      user,
      project,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test.md': factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4',
        }),
      },
    })
    workspace = w
    const provider = ps[0]!
    document = ds[0]!

    evaluation = await factories.createLlmAsJudgeEvaluation({
      workspace: workspace,
      user: user,
    })

    const { commit: c } = await factories.createDraft({
      project: project,
      user: user,
    })
    commit = c

    evaluationResults = []
    for (let i = 0; i < 5; i++) {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })

      const providerLog = await factories.createProviderLog({
        workspace: workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
      })

      const { evaluationResult } = await factories.createEvaluationResult({
        evaluation: evaluation,
        documentLog: documentLog,
        evaluatedProviderLog: providerLog,
      })
      evaluationResults.unshift(evaluationResult)
    }
  })

  it('returns no page when evaluation result not found', async () => {
    const page = await findEvaluationResultWithMetadataPage({
      workspaceId: workspace.id,
      evaluation: evaluation,
      documentUuid: '123e4567-e89b-12d3-a456-426614174000',
      draft: commit,
      resultUuid: '987f6543-b21a-98d7-c654-321fedcba987',
      pageSize: '25',
    })

    expect(page).toBeUndefined()
  })

  it('returns page where evaluation result is', async () => {
    let page = await findEvaluationResultWithMetadataPage({
      workspaceId: workspace.id,
      evaluation: evaluation,
      documentUuid: document.documentUuid,
      draft: commit,
      resultUuid: evaluationResults[0]!.uuid,
      pageSize: '25',
    })

    expect(page).toEqual(1)

    page = await findEvaluationResultWithMetadataPage({
      workspaceId: workspace.id,
      evaluation: evaluation,
      documentUuid: document.documentUuid,
      draft: commit,
      resultUuid: evaluationResults[2]!.uuid,
      pageSize: '25',
    })

    expect(page).toEqual(1)

    page = await findEvaluationResultWithMetadataPage({
      workspaceId: workspace.id,
      evaluation: evaluation,
      documentUuid: document.documentUuid,
      draft: commit,
      resultUuid: evaluationResults[4]!.uuid,
      pageSize: '25',
    })

    expect(page).toEqual(1)

    page = await findEvaluationResultWithMetadataPage({
      workspaceId: workspace.id,
      evaluation: evaluation,
      documentUuid: document.documentUuid,
      draft: commit,
      resultUuid: evaluationResults[0]!.uuid,
      pageSize: '1',
    })

    expect(page).toEqual(1)

    page = await findEvaluationResultWithMetadataPage({
      workspaceId: workspace.id,
      evaluation: evaluation,
      documentUuid: document.documentUuid,
      draft: commit,
      resultUuid: evaluationResults[2]!.uuid,
      pageSize: '1',
    })

    expect(page).toEqual(3)

    page = await findEvaluationResultWithMetadataPage({
      workspaceId: workspace.id,
      evaluation: evaluation,
      documentUuid: document.documentUuid,
      draft: commit,
      resultUuid: evaluationResults[4]!.uuid,
      pageSize: '1',
    })

    expect(page).toEqual(5)
  })
})
