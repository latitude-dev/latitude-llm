import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorableEntity, LogSources, Providers } from '../../browser'
import { createProject, createRunError, helpers } from '../../tests/factories'
import { createDocumentLog } from '../../tests/factories/documentLogs'
import { WebsocketClient } from '../../websockets/workers'
import { notifyToClientDocumentLogCreatedJob } from './notifyToClientDocumentLogCreatedJob'

// Mock dependencies
vi.mock('../../websockets/workers', () => ({
  WebsocketClient: {
    sendEvent: vi.fn(),
  },
}))

describe('notifyToClientDocumentLogCreatedJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should emit documentLogCreated event with correct data', async () => {
    // Create test data using factories
    const { workspace, commit, documents } = await createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        test: helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })

    const { documentLog } = await createDocumentLog({
      document: documents[0]!,
      commit,
      source: LogSources.API,
    })

    const event = {
      type: 'documentLogCreated',
      data: {
        id: documentLog.id,
        workspaceId: workspace.id,
      },
    }

    // @ts-ignore
    await notifyToClientDocumentLogCreatedJob({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentLogCreated',
      {
        workspaceId: workspace.id,
        data: {
          workspaceId: workspace.id,
          documentUuid: documentLog.documentUuid,
          documentLogId: documentLog.id,
          commitUuid: commit.uuid,
          documentLogWithMetadata: expect.any(Object),
        },
      },
    )
  })

  it('should handle document logs with errors', async () => {
    const { workspace, commit, documents } = await createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        test: helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })

    const { documentLog } = await createDocumentLog({
      document: documents[0]!,
      commit,
      source: LogSources.API,
    })

    await createRunError({
      errorableType: ErrorableEntity.DocumentLog,
      errorableUuid: documentLog.uuid,
      code: RunErrorCodes.AIProviderConfigError,
      message: 'test',
    })

    const event = {
      type: 'documentLogCreated',
      data: {
        id: documentLog.id,
        workspaceId: workspace.id,
      },
    }

    // @ts-ignore
    await notifyToClientDocumentLogCreatedJob({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalled()
  })
})
