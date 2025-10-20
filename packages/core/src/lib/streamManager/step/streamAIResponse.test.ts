import { APICallError } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

import { Providers } from '@latitude-data/constants'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '../../../constants'
import { Result } from '../../../lib/Result'
import * as aiModule from '../../../services/ai'
import * as factories from '../../../tests/factories'
import { streamAIResponse } from './streamAIResponse'
import * as handleAIErrorModule from './handleAIError'

describe('streamAIResponse', () => {
  it('calls handleAIError when streaming encounters an error', async () => {
    const { workspace } = await factories.createWorkspace()
    const context = factories.createTelemetryContext({ workspace })
    const provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'test-provider',
      user: await factories.createUser(),
    })

    const handleAIErrorSpy = vi.spyOn(handleAIErrorModule, 'handleAIError')
    handleAIErrorSpy.mockImplementation(() => {})

    const streamError = new APICallError({
      message: 'Stream error occurred',
      url: 'https://api.openai.com',
      responseBody: 'Stream error response',
      requestBodyValues: {},
    })

    // Mock the ai service to capture the onError callback and trigger it
    vi.spyOn(aiModule, 'ai').mockImplementation(async (options) => {
      if (options.onError) {
        options.onError(streamError as any)
      }

      return Result.ok({
        type: 'text',
        text: Promise.resolve(''),
        reasoning: Promise.resolve(undefined),
        usage: Promise.resolve({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        }),
        toolCalls: Promise.resolve([]),
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-delta', id: '1', text: 'Hello' })
            controller.close()
          },
        }),
        providerName: Providers.OpenAI,
        providerMetadata: Promise.resolve(undefined),
        finishReason: Promise.resolve('stop'),
        response: Promise.resolve({ messages: [] }),
      } as unknown as aiModule.AIReturn<'text'>)
    })

    // Create a proper controller through ReadableStream
    let controller: ReadableStreamDefaultController
    new ReadableStream({
      start(ctrl) {
        controller = ctrl
      },
    })

    // Call streamAIResponse
    await streamAIResponse({
      context,
      controller: controller!,
      workspace,
      provider,
      messages: [
        {
          role: MessageRole.user,
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      config: {
        model: 'gpt-4',
        provider: provider.name,
      },
      source: LogSources.API,
      documentLogUuid: randomUUID(),
    })

    expect(handleAIErrorSpy).toHaveBeenCalledWith(streamError)
  })
})
