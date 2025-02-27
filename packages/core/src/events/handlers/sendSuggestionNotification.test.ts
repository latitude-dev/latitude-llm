import { subDays } from 'date-fns'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  DOCUMENT_SUGGESTION_NOTIFICATION_DAYS,
  DocumentSuggestion,
  DocumentVersion,
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  User,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib'
import * as mailers from '../../mailers'
import { users } from '../../schema'
import * as factories from '../../tests/factories'
import { sendSuggestionNotification } from './sendSuggestionNotification'

describe('sendSuggestionNotification', () => {
  let mocks: {
    mailer: {
      constructor: MockInstance
      send: MockInstance
    }
  }

  let workspace: Workspace
  let user: User
  let document: DocumentVersion
  let evaluation: EvaluationDto
  let suggestion: DocumentSuggestion

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      providers,
      project,
      user: u,
    } = await factories.createProject()
    workspace = w
    user = u
    const provider = providers[0]!

    const commit = await factories.createCommit({
      projectId: project.id,
      user: user,
    })

    const { documentVersion: d } = await factories.createDocumentVersion({
      workspace: workspace,
      user: user,
      commit: commit,
      path: 'prompt',
      content: factories.helpers.createPrompt({ provider }),
    })
    document = d

    evaluation = await factories.createEvaluation({
      workspace: workspace,
      user: user,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })

    await factories.createConnectedEvaluation({
      workspace: workspace,
      user: user,
      evaluationUuid: evaluation.uuid,
      documentUuid: document.documentUuid,
      live: true,
    })

    suggestion = await factories.createDocumentSuggestion({
      document: document,
      evaluation: evaluation,
      workspace: workspace,
    })

    const mockSend = vi.fn().mockResolvedValue(Result.nil())
    mocks = {
      mailer: {
        constructor: vi
          .spyOn(mailers, 'SuggestionMailer')
          .mockReturnValue({ send: mockSend } as any),
        send: mockSend,
      },
    }
  })

  it('not sends notification mail when limits are exceeded', async () => {
    await database
      .update(users)
      .set({
        lastSuggestionNotifiedAt: new Date(),
      })
      .where(eq(users.id, user.id))

    await sendSuggestionNotification({
      data: {
        type: 'documentSuggestionCreated',
        data: {
          workspaceId: workspace.id,
          suggestion: suggestion,
          evaluation: evaluation,
        },
      },
    })

    expect(mocks.mailer.constructor).not.toHaveBeenCalled()
    expect(mocks.mailer.send).not.toHaveBeenCalled()
  })

  it('sends notification mail when notified long ago', async () => {
    await database
      .update(users)
      .set({
        lastSuggestionNotifiedAt: subDays(
          new Date(),
          DOCUMENT_SUGGESTION_NOTIFICATION_DAYS + 1,
        ),
      })
      .where(eq(users.id, user.id))

    await sendSuggestionNotification({
      data: {
        type: 'documentSuggestionCreated',
        data: {
          workspaceId: workspace.id,
          suggestion: suggestion,
          evaluation: evaluation,
        },
      },
    })

    expect(mocks.mailer.constructor).toHaveBeenCalledOnce()
    expect(mocks.mailer.constructor).toHaveBeenCalledWith(
      { to: user.email },
      {
        user: user.name!,
        document: 'prompt',
        evaluation: evaluation.name,
        suggestion: suggestion.summary,
        link: expect.stringContaining(
          '?utm_source=email&utm_campaign=document_suggestions',
        ),
      },
    )
    expect(mocks.mailer.send).toHaveBeenCalledOnce()
  })

  it('sends notification mail when never notified before', async () => {
    await sendSuggestionNotification({
      data: {
        type: 'documentSuggestionCreated',
        data: {
          workspaceId: workspace.id,
          suggestion: suggestion,
          evaluation: evaluation,
        },
      },
    })

    expect(mocks.mailer.constructor).toHaveBeenCalledOnce()
    expect(mocks.mailer.constructor).toHaveBeenCalledWith(
      { to: user.email },
      {
        user: user.name!,
        document: 'prompt',
        evaluation: evaluation.name,
        suggestion: suggestion.summary,
        link: expect.stringContaining(
          '?utm_source=email&utm_campaign=document_suggestions',
        ),
      },
    )
    expect(mocks.mailer.send).toHaveBeenCalledOnce()
  })
})
