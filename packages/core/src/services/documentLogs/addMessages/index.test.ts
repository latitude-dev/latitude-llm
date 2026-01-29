import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { LogSources } from '../../../constants'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { Result } from '../../../lib/Result'
import {
  createDocumentLog,
  createProject,
  createProviderLog,
} from '../../../tests/factories'
import {
  telemetry as realTelemetry,
  type LatitudeTelemetry,
} from '../../../telemetry'
import { addMessages } from './index'

const mocks = {
  runAi: vi.fn(async () => {
    const fullStream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })

    return Result.ok({
      type: 'text',
      text: Promise.resolve('Fake AI generated text'),
      providerLog: Promise.resolve({ uuid: 'fake-provider-log-uuid' }),
      usage: Promise.resolve({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }),
      toolCalls: Promise.resolve([]),
      response: Promise.resolve({ messages: [] }),
      fullStream,
    })
  }),
}

const aiSpy = vi.spyOn(await import('../../ai'), 'ai')

describe('addMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - we are mocking the function
    aiSpy.mockImplementation(mocks.runAi)
  })

  it('calls telemetry.span.prompt with projectId and all required parameters', async () => {
    const { workspace, documents, commit, providers } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: `
---
provider: openai
model: gpt-4o
---
Hello world
`,
      },
    })

    const document = documents[0]!
    const provider = providers[0]!

    const { documentLog } = await createDocumentLog({
      document,
      commit,
    })

    await createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
    })

    const mockPrompt = vi
      .fn()
      .mockImplementation(realTelemetry.span.prompt.bind(realTelemetry.span))

    const mockChat = vi
      .fn()
      .mockImplementation(realTelemetry.span.chat.bind(realTelemetry.span))

    const mockTelemetry = {
      ...realTelemetry,
      span: {
        ...realTelemetry.span,
        prompt: mockPrompt,
        chat: mockChat,
      },
    } as unknown as LatitudeTelemetry

    const result = await addMessages(
      {
        workspace,
        documentLogUuid: documentLog.uuid,
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        source: LogSources.API,
      },
      mockTelemetry,
    )

    expect(result.ok).toBe(true)

    expect(mockPrompt).toHaveBeenCalledTimes(0)

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        documentLogUuid: documentLog.uuid,
        name: document.path.split('/').at(-1),
        source: LogSources.API,
        previousTraceId: expect.any(String),
      }),
      expect.anything(),
    )
  })
})
