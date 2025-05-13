import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentLog,
  DocumentVersion,
  Providers,
  Workspace,
} from '../../browser'
import * as factories from '../../tests/factories'
import { findDocumentLogWithEvaluationResultPage } from './fetchDocumentLogsWithEvaluationResults'

describe('findDocumentLogWithEvaluationResultPage', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let documentLogs: DocumentLog[]

  beforeEach(async () => {
    const {
      workspace: w,
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
    document = ds[0]!

    const { commit: c } = await factories.createDraft({
      project: project,
      user: user,
    })
    commit = c

    documentLogs = []
    for (let i = 0; i < 5; i++) {
      await factories.createDocumentLog({
        document,
        commit,
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
