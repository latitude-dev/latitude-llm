import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyToClientDocumentLogCreatedJob } from './notifyToClientDocumentLogCreatedJob'
import { WebsocketClient } from '../../websockets/workers'
import { createDocumentLog } from '../../tests/factories/documentLogs'
import { LogSources, Providers } from '@latitude-data/constants'
import { createProject, createRunError, helpers } from '../../tests/factories'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { ErrorableEntity } from '../../constants'

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

    // @ts-expect-error - ignore type issue for test
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

    // @ts-expect-error - ignore type issue for test
    await notifyToClientDocumentLogCreatedJob({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalled()
  })
})
