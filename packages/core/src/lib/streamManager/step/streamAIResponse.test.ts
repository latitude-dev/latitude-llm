import { APICallError } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

import { Providers } from '@latitude-data/constants'
import {
  ChainError,
  PaymentRequiredError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import { Message, MessageRole } from '@latitude-data/constants/messages'
import { LogSources } from '../../../constants'
import { Result } from '../../../lib/Result'
import * as aiModule from '../../../services/ai'
import * as processResponseModule from '../../../services/chains/ProviderProcessor'
import * as consumeStreamModule from '../ChainStreamConsumer/consumeStream'
import * as factories from '../../../tests/factories'
import * as usageModule from '../../../services/workspaces/usage'
import * as recordAbortedCompletionModule from './recordAbortedCompletion'
import { streamAIResponse } from './streamAIResponse'
import * as handleAIErrorModule from './handleAIError'
import * as cacheModule from '../../../services/conversations/cache'

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
        options.onError({ error: streamError })
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

    expect(handleAIErrorSpy).toHaveBeenCalledWith({ error: streamError })
  })

  it('calls recordAbortedCompletion when stream is aborted', async () => {
    const { workspace } = await factories.createWorkspace()
    const context = factories.createTelemetryContext({ workspace })
    const provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'test-provider',
      user: await factories.createUser(),
    })

    vi.spyOn(usageModule, 'assertUsageWithinPlanLimits').mockResolvedValue(
      Result.ok(undefined),
    )

    vi.spyOn(aiModule, 'ai').mockResolvedValue(
      Result.ok({
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
      } as unknown as aiModule.AIReturn<'text'>),
    )

    const abortError = new ChainError({
      code: RunErrorCodes.AbortError,
      message: 'Stream aborted by user',
    })
    vi.spyOn(consumeStreamModule, 'consumeStream').mockRejectedValue(abortError)

    const recordAbortedCompletionSpy = vi
      .spyOn(recordAbortedCompletionModule, 'recordAbortedCompletion')
      .mockImplementation(() => {})

    let controller: ReadableStreamDefaultController
    new ReadableStream({
      start(ctrl) {
        controller = ctrl
      },
    })

    const messages = [
      {
        role: MessageRole.user,
        content: [{ type: 'text' as const, text: 'Hello' }],
      },
    ] as unknown as Message[]
    const config = {
      model: 'gpt-4',
      provider: provider.name,
    }
    const documentLogUuid = randomUUID()

    await expect(
      streamAIResponse({
        context,
        controller: controller!,
        workspace,
        provider,
        messages,
        config,
        source: LogSources.API,
        documentLogUuid,
      }),
    ).rejects.toThrow(abortError)

    expect(recordAbortedCompletionSpy).toHaveBeenCalledWith({
      context,
      provider,
      config,
      messages,
      accumulatedText: '',
    })
  })

  describe('usage limit defense', () => {
    const createMockAIResult = () => ({
      type: 'text' as const,
      text: Promise.resolve('test response'),
      reasoning: Promise.resolve(undefined),
      usage: Promise.resolve({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      }),
      toolCalls: Promise.resolve([]),
      fullStream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta', id: '1', text: 'test' })
          controller.close()
        },
      }),
      providerName: Providers.OpenAI,
      providerMetadata: Promise.resolve(undefined),
      finishReason: Promise.resolve('stop' as const),
      response: Promise.resolve({ messages: [] }),
    })

    const createMockController = () => {
      let controller: ReadableStreamDefaultController
      new ReadableStream({
        start(ctrl) {
          controller = ctrl
        },
      })
      return controller!
    }

    beforeEach(() => {
      vi.spyOn(aiModule, 'ai').mockResolvedValue(
        Result.ok(createMockAIResult() as unknown as aiModule.AIReturn<'text'>),
      )
      vi.spyOn(processResponseModule, 'processResponse').mockResolvedValue({
        streamType: 'text',
        text: 'test response',
        toolCalls: [],
        output: [],
        reasoning: undefined,
        input: [],
        model: 'gpt-4o',
        provider: Providers.OpenAI,
        cost: 0,
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cachedInputTokens: 0,
          reasoningTokens: 0,
        },
        documentLogUuid: randomUUID(),
      })
      vi.spyOn(consumeStreamModule, 'consumeStream').mockResolvedValue({
        error: undefined,
      })
    })

    it('throws PaymentRequiredError when usage exceeds plan limits', async () => {
      const { workspace } = await factories.createWorkspace()
      const context = factories.createTelemetryContext({ workspace })
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'test-provider',
        user: await factories.createUser(),
      })

      const paymentRequiredError = new PaymentRequiredError(
        'You have reached the maximum number of runs allowed for your Latitude plan. Upgrade now.',
      )

      vi.spyOn(usageModule, 'assertUsageWithinPlanLimits').mockResolvedValue(
        Result.error(paymentRequiredError),
      )

      const controller = createMockController()

      await expect(
        streamAIResponse({
          context,
          controller,
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
        }),
      ).rejects.toThrow(paymentRequiredError)

      expect(usageModule.assertUsageWithinPlanLimits).toHaveBeenCalledWith(
        workspace,
      )
      expect(aiModule.ai).not.toHaveBeenCalled()
    })

    it('proceeds when usage is within plan limits', async () => {
      const { workspace } = await factories.createWorkspace()
      const context = factories.createTelemetryContext({ workspace })
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'test-provider',
        user: await factories.createUser(),
      })

      vi.spyOn(usageModule, 'assertUsageWithinPlanLimits').mockResolvedValue(
        Result.ok(undefined),
      )

      const controller = createMockController()

      await streamAIResponse({
        context,
        controller,
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

      expect(usageModule.assertUsageWithinPlanLimits).toHaveBeenCalledWith(
        workspace,
      )
      expect(aiModule.ai).toHaveBeenCalled()
    })

    it('proceeds when usage check returns nil (unlimited plan)', async () => {
      const { workspace } = await factories.createWorkspace()
      const context = factories.createTelemetryContext({ workspace })
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'test-provider',
        user: await factories.createUser(),
      })

      vi.spyOn(usageModule, 'assertUsageWithinPlanLimits').mockResolvedValue(
        Result.nil(),
      )

      const controller = createMockController()

      await streamAIResponse({
        context,
        controller,
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

      expect(usageModule.assertUsageWithinPlanLimits).toHaveBeenCalledWith(
        workspace,
      )
      expect(aiModule.ai).toHaveBeenCalled()
    })

    it('writes to conversation cache when conversationContext is provided', async () => {
      const writeCacheSpy = vi.spyOn(cacheModule, 'writeConversationCache')
      writeCacheSpy.mockResolvedValue(Result.nil())

      const { workspace } = await factories.createWorkspace()
      const context = factories.createTelemetryContext({ workspace })
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'test-provider',
        user: await factories.createUser(),
      })

      vi.spyOn(usageModule, 'assertUsageWithinPlanLimits').mockResolvedValue(
        Result.ok(undefined),
      )

      const controller = createMockController()
      const documentLogUuid = randomUUID()
      const commitUuid = randomUUID()
      const documentUuid = randomUUID()

      await streamAIResponse({
        context,
        controller,
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
        documentLogUuid,
        conversationContext: {
          commitUuid,
          documentUuid,
        },
      })

      expect(writeCacheSpy).toHaveBeenCalledWith({
        documentLogUuid,
        workspaceId: workspace.id,
        commitUuid,
        documentUuid,
        providerId: provider.id,
        messages: expect.any(Array),
      })
    })

    it('does not write to conversation cache when conversationContext is not provided', async () => {
      const writeCacheSpy = vi.spyOn(cacheModule, 'writeConversationCache')
      writeCacheSpy.mockResolvedValue(Result.nil())

      const { workspace } = await factories.createWorkspace()
      const context = factories.createTelemetryContext({ workspace })
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'test-provider',
        user: await factories.createUser(),
      })

      vi.spyOn(usageModule, 'assertUsageWithinPlanLimits').mockResolvedValue(
        Result.ok(undefined),
      )

      const controller = createMockController()

      await streamAIResponse({
        context,
        controller,
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

      expect(writeCacheSpy).not.toHaveBeenCalled()
    })
  })
})
