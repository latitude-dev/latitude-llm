import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EvaluationRunEvent } from '.'
import {
  Commit,
  DocumentLog,
  DocumentVersion,
  Project,
  ProviderApiKey,
  ProviderLog,
  User,
  Workspace,
} from '../../browser'
import { EvaluationResultableType, Providers } from '../../constants'
import { NotFoundError } from '../../lib'
import { mergeCommit } from '../../services/commits'
import * as factories from '../../tests/factories'

const mocks = vi.hoisted(() => {
  const mockEmit = vi.fn()
  return {
    getSocket: vi.fn().mockResolvedValue({ emit: mockEmit }),
    mockEmit,
  }
})

vi.mock('../../websockets/workers', async (importOriginal) => {
  const mod =
    (await importOriginal()) as typeof import('../../websockets/workers')
  return {
    ...mod,
    WebsocketClient: {
      getSocket: mocks.getSocket,
    },
  }
})

let event: EvaluationRunEvent
let workspace: Workspace
let user: User
let project: Project
let provider: ProviderApiKey
let evaluation: Awaited<ReturnType<typeof factories.createLlmAsJudgeEvaluation>>
let commit: Commit
let documentVersion: DocumentVersion
let documentLog: DocumentLog
let providerLog: ProviderLog

describe('createEvaluationResultJob', () => {
  beforeEach(async () => {
    vi.resetModules()

    const basic = await factories.createProject()
    workspace = basic.workspace
    user = basic.user
    project = basic.project
    provider = basic.providers[0]!
    const { commit: draft } = await factories.createDraft({ project, user })
    const doc = await factories.createDocumentVersion({
      commit: draft,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({ provider }),
    })
    documentVersion = doc.documentVersion
    commit = await mergeCommit(draft).then((r) => r.unwrap())

    evaluation = await factories.createLlmAsJudgeEvaluation({
      workspace,
      prompt: factories.helpers.createPrompt({ provider }),
      configuration: {
        type: EvaluationResultableType.Number,
        detail: {
          range: { from: 0, to: 100 },
        },
      },
    })
    const { documentLog: log } = await factories.createDocumentLog({
      document: documentVersion,
      commit,
    })
    documentLog = log

    providerLog = await factories.createProviderLog({
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: Providers.OpenAI,
    })
    event = {
      type: 'evaluationRun',
      data: {
        evaluationId: evaluation.id,
        documentUuid: documentVersion.documentUuid,
        documentLogUuid: documentLog.uuid,
        providerLogUuid: providerLog.uuid,
        response: {
          object: { result: 33 },
        },
      },
    } as unknown as EvaluationRunEvent
  })

  it('send websocket event for "evaluationResultCreated"', async () => {
    const mod = await import('./createEvaluationResultJob')
    const { createEvaluationResultJob } = mod
    await createEvaluationResultJob({ data: event })

    expect(mocks.mockEmit).toHaveBeenCalledWith('evaluationResultCreated', {
      workspaceId: workspace.id,
      data: {
        documentUuid: documentVersion.documentUuid,
        workspaceId: workspace.id,
        evaluationId: evaluation.id,
        evaluationResultId: expect.any(Number),
        row: {
          commit,
          id: expect.any(Number),
          evaluationId: evaluation.id,
          documentLogId: documentLog.id,
          providerLogId: providerLog.id,
          resultableType: EvaluationResultableType.Number,
          resultableId: expect.any(Number),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          tokens: expect.any(Number),
          costInMillicents: expect.any(Number),
          result: '33',
        },
      },
    })
  })

  it('should throw NotFoundError when evaluation is not found', async () => {
    const mod = await import('./createEvaluationResultJob')
    const { createEvaluationResultJob } = mod
    const data = {
      ...event,
      data: { ...event.data, evaluationId: 999 },
    }
    await expect(createEvaluationResultJob({ data })).rejects.toThrow(
      new NotFoundError('Evaluation not found'),
    )
  })

  it('should throw NotFoundError when documentLogs is not found', async () => {
    const mod = await import('./createEvaluationResultJob')
    const { createEvaluationResultJob } = mod
    const fakeUuid = '00000000-0000-0000-0000-000000000000'
    const data = {
      ...event,
      data: { ...event.data, documentLogUuid: fakeUuid },
    }
    await expect(createEvaluationResultJob({ data })).rejects.toThrow(
      new NotFoundError('Document log not found'),
    )
  })

  it('should throw NotFoundError when providerLog is not found', async () => {
    const mod = await import('./createEvaluationResultJob')
    const { createEvaluationResultJob } = mod
    const fakeUuid = '00000000-0000-0000-0000-000000000000'
    const data = {
      ...event,
      data: { ...event.data, providerLogUuid: fakeUuid },
    }
    await expect(createEvaluationResultJob({ data })).rejects.toThrow(
      new NotFoundError('Provider log not found'),
    )
  })
})
