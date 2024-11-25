import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentLog,
  DocumentVersion,
  EvaluationDto,
  ProviderApiKey,
  Providers,
  Workspace,
} from '../../browser'
import * as factories from '../../tests/factories'
import {
  fetchDocumentLogsWithEvaluationResults,
  findDocumentLogWithEvaluationResultPage,
} from './fetchDocumentLogsWithEvaluationResults'

describe('fetchDocumentLogsWithEvaluationResults', () => {
  let workspace: Workspace
  let evaluation: EvaluationDto
  let commit: Commit
  let document: DocumentVersion
  let provider: ProviderApiKey

  beforeEach(async () => {
    // Setup project with a provider
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test.md': factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4',
        }),
      },
    })
    provider = setup.providers[0]!
    workspace = setup.workspace

    // Create evaluation
    evaluation = await factories.createLlmAsJudgeEvaluation({
      workspace: setup.workspace,
      user: setup.user,
    })

    // Create draft commit
    const draftResult = await factories.createDraft({
      project: setup.project,
      user: setup.user,
    })
    commit = draftResult.commit
    document = setup.documents[0]!

    // Create document logs with provider logs and evaluation results
    const { documentLog } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit,
    })

    // Create provider log
    await factories.createProviderLog({
      workspace: setup.workspace,
      documentLogUuid: documentLog.uuid,
      providerId: setup.providers[0]!.id,
      providerType: setup.providers[0]!.provider,
    })

    // Create evaluation result
    await factories.createEvaluationResult({
      evaluation,
      documentLog,
      evaluatedProviderLog: await factories.createProviderLog({
        workspace: setup.workspace,
        documentLogUuid: documentLog.uuid,
        providerId: setup.providers[0]!.id,
        providerType: setup.providers[0]!.provider,
      }),
    })
  })

  it('fetches document logs with evaluation results and provider logs', async () => {
    const logs = await fetchDocumentLogsWithEvaluationResults({
      evaluation,
      documentUuid: document.documentUuid,
      commit,
      page: '1',
      pageSize: '25',
    })

    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      uuid: expect.any(String),
      documentUuid: document.documentUuid,
      result: expect.objectContaining({
        evaluationId: evaluation.id,
      }),
      providerLogs: expect.arrayContaining([
        expect.objectContaining({
          uuid: expect.any(String),
          documentLogUuid: expect.any(String),
        }),
      ]),
    })
  })

  it('handles pagination correctly', async () => {
    // Create additional document logs
    for (let i = 0; i < 3; i++) {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })

      await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
      })
    }

    const pageSize = '2'
    const firstPage = await fetchDocumentLogsWithEvaluationResults({
      evaluation,
      documentUuid: document.documentUuid,
      commit,
      page: '1',
      pageSize,
    })

    const secondPage = await fetchDocumentLogsWithEvaluationResults({
      evaluation,
      documentUuid: document.documentUuid,
      commit,
      page: '2',
      pageSize,
    })

    expect(firstPage).toHaveLength(2)
    expect(secondPage).toHaveLength(2)
    expect(firstPage[0]!.id).not.toBe(secondPage[0]!.id)
  })

  it('returns empty array when no logs exist', async () => {
    const nonExistentUuid = '123e4567-e89b-12d3-a456-426614174000' // does not exist
    const logs = await fetchDocumentLogsWithEvaluationResults({
      evaluation,
      documentUuid: nonExistentUuid,
      commit,
      page: '1',
      pageSize: '25',
    })

    expect(logs).toHaveLength(0)
  })
})

describe('findDocumentLogWithEvaluationResultPage', () => {
  let workspace: Workspace
  let evaluation: EvaluationDto
  let commit: Commit
  let document: DocumentVersion
  let documentLogs: DocumentLog[]

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

    documentLogs = []
    for (let i = 0; i < 5; i++) {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })
      documentLogs.unshift(documentLog)

      const providerLog = await factories.createProviderLog({
        workspace: workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
      })

      await factories.createEvaluationResult({
        evaluation: evaluation,
        documentLog: documentLog,
        evaluatedProviderLog: providerLog,
      })
    }
  })

  it('returns no page when document log not found', async () => {
    const page = await findDocumentLogWithEvaluationResultPage({
      workspaceId: workspace.id,
      documentUuid: '123e4567-e89b-12d3-a456-426614174000',
      commit: commit,
      documentLogId: '31',
      pageSize: '25',
    })

    expect(page).toBeUndefined()
  })

  it('returns page where document log is', async () => {
    let page = await findDocumentLogWithEvaluationResultPage({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commit: commit,
      documentLogId: documentLogs[0]!.id.toString(),
      pageSize: '25',
    })

    expect(page).toEqual(1)

    page = await findDocumentLogWithEvaluationResultPage({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commit: commit,
      documentLogId: documentLogs[2]!.id.toString(),
      pageSize: '25',
    })

    expect(page).toEqual(1)

    page = await findDocumentLogWithEvaluationResultPage({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commit: commit,
      documentLogId: documentLogs[4]!.id.toString(),
      pageSize: '25',
    })

    expect(page).toEqual(1)

    page = await findDocumentLogWithEvaluationResultPage({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commit: commit,
      documentLogId: documentLogs[0]!.id.toString(),
      pageSize: '1',
    })

    expect(page).toEqual(1)

    page = await findDocumentLogWithEvaluationResultPage({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commit: commit,
      documentLogId: documentLogs[2]!.id.toString(),
      pageSize: '1',
    })

    expect(page).toEqual(3)

    page = await findDocumentLogWithEvaluationResultPage({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commit: commit,
      documentLogId: documentLogs[4]!.id.toString(),
      pageSize: '1',
    })

    expect(page).toEqual(5)
  })
})
