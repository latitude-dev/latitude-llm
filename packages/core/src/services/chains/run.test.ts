import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChainEventTypes } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { TelemetryContext } from '@latitude-data/telemetry'
import { Workspace } from '../../browser'
import {
  ErrorableEntity,
  LogSources,
  PromptSource,
  Providers,
  StreamEventTypes,
} from '../../constants'
import * as factories from '../../tests/factories'
import { testConsumeStream } from '../../tests/helpers'
import * as aiModule from '../ai'
import { runChain } from './run'
import { Result, TypedResult } from './../../lib/Result'
import { Chain, MessageRole } from 'promptl-ai'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

const mocks = vi.hoisted(() => ({
  v4: vi.fn(),
}))

// Mock other dependencies
vi.mock('uuid', async (importOriginal) => ({
  ...(await importOriginal()),
  v4: mocks.v4,
}))

describe('runChain', () => {
  const mockChain: Partial<Chain> = {
    step: vi.fn(),
    rawText: 'Test raw text',
  }

  const mockUUID = '12345678-1234-1234-1234-123456789012'
  let providersMap: Map<string, any>

  function createMockAiResponse(text: string, totalTokens: number) {
    return Result.ok({
      type: 'text',
      text: Promise.resolve(text),
      usage: Promise.resolve({ totalTokens }),
      toolCalls: Promise.resolve([]),
      providerLog: Promise.resolve({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
      }),
      response: Promise.resolve({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text }],
          },
        ],
      }),
      fullStream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text', text })
          controller.close()
        },
      }),
    })
  }

  let context: TelemetryContext
  let workspace: Workspace
  let promptSource: PromptSource

  beforeEach(async () => {
    vi.resetAllMocks()
    mocks.v4.mockReturnValue(mockUUID)

    const {
      workspace: w,
      commit,
      providers,
      documents,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        'prompt-source': factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    providersMap = new Map(providers.map((p) => [p.name, p]))
    workspace = w
    promptSource = { document: documents[0]!, commit }
    context = await factories.createTelemetryContext({ workspace })
  })

  it('handles multiple steps in a chain', async () => {
    const mockAiResponse1 = createMockAiResponse('AI response 1', 10)
    const mockAiResponse2 = createMockAiResponse('AI response 2', 15)

    vi.spyOn(aiModule, 'ai')
      .mockResolvedValueOnce(mockAiResponse1 as any)
      .mockResolvedValueOnce(mockAiResponse2 as any)

    vi.mocked(mockChain.step!)
      .mockResolvedValueOnce({
        completed: false,
        messages: [
          {
            role: MessageRole.user,
            // @ts-expect-error - TODO(compiler): fix types
            content: [{ type: 'text', text: 'Step 1' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      })
      .mockResolvedValueOnce({
        completed: false,
        messages: [
          {
            role: MessageRole.user,
            // @ts-expect-error - TODO(compiler): fix types
            content: [{ type: 'text', text: 'Step 1' }],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                // @ts-expect-error - TODO(compiler): fix types
                type: 'text',
                text: 'AI response 1',
              },
            ],
            toolCalls: [],
          },
          {
            role: MessageRole.user,
            // @ts-expect-error - TODO(compiler): fix types
            content: [{ type: 'text', text: 'Step 2' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      })
      .mockResolvedValueOnce({
        completed: true,
        messages: [],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      })

    const run = runChain({
      context,
      workspace,
      // @ts-expect-error - TODO(compiler): fix types
      chain: mockChain,
      globalConfig: {} as LatitudePromptConfig,
      promptlVersion: 0,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
      promptSource,
    })

    const response = await run.response
    expect(response).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        text: 'AI response 2',
        usage: { totalTokens: 15 },
        toolCalls: [],
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledTimes(2)
  })

  it('handles error response', async () => {
    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: false,
      messages: [
        {
          role: MessageRole.user,
          // @ts-expect-error - TODO(compiler): fix types
          content: [{ type: 'text', text: 'user message' }],
        },
      ],
      config: { provider: 'openai', model: 'gpt-3.5-turbo' },
    })

    vi.spyOn(aiModule, 'ai').mockResolvedValue(
      Result.ok({
        type: 'text',
        text: Promise.resolve(''),
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'error',
              error: new Error('provider error'),
            })
            controller.close()
          },
        }),
        providerName: 'openai',
        response: Promise.resolve({ messages: [] }),
      }) as any as TypedResult<aiModule.AIReturn<'text'>, any>,
    )

    const result = runChain({
      context,
      workspace,
      // @ts-expect-error - TODO(compiler): fix types
      chain: mockChain,
      providersMap,
      source: LogSources.API,
      promptSource,
    })
    const { value: stream } = await testConsumeStream(result.stream)
    const error = await result.error

    expect(stream.at(-2)).toEqual({
      event: StreamEventTypes.Latitude,
      data: expect.objectContaining({
        type: ChainEventTypes.ChainError,
        error: expect.objectContaining({
          message: 'Openai returned this error: provider error',
        }),
      }),
    })

    expect(error).toEqual(
      new ChainError({
        message: 'Openai returned this error: provider error',
        code: RunErrorCodes.AIRunError,
      }),
    )
  })

  it('handles tool calls response', async () => {
    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: false,
      messages: [
        {
          role: MessageRole.user,
          // @ts-expect-error - TODO(compiler): fix types
          content: [{ type: 'text', text: 'user message' }],
        },
      ],
      config: { provider: 'openai', model: 'gpt-3.5-turbo' },
    })
    vi.spyOn(aiModule, 'ai').mockResolvedValue(
      Result.ok({
        type: 'text',
        text: Promise.resolve('assistant message'),
        toolCalls: Promise.resolve([
          {
            toolCallId: 'tool-call-id',
            toolName: 'tool-call-name',
            args: { arg1: 'value1', arg2: 'value2' },
          },
        ]),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        fullStream: new ReadableStream({
          start: (controller) => controller.close(),
        }),
        providerName: 'openai',
        response: Promise.resolve({
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'text', text: 'assistant message' },
                {
                  type: 'tool-call',
                  toolCallId: 'tool-call-id',
                  toolName: 'tool-call-name',
                  args: { arg1: 'value1', arg2: 'value2' },
                },
              ],
            },
          ],
        }),
      }) as any as TypedResult<aiModule.AIReturn<'text'>, any>,
    )

    const result = runChain({
      context,
      workspace,
      // @ts-expect-error - TODO(compiler): fix types
      chain: mockChain,
      promptlVersion: 0,
      providersMap,
      source: LogSources.API,
      promptSource,
    })
    const { value: stream } = await testConsumeStream(result.stream)
    const response = await result.response

    expect(stream.at(-1)).toEqual({
      event: StreamEventTypes.Latitude,
      data: expect.objectContaining({
        uuid: expect.any(String),
        type: ChainEventTypes.ChainCompleted,
        messages: [
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'user message',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'text',
                text: 'assistant message',
              },
              {
                type: 'tool-call',
                toolCallId: 'tool-call-id',
                toolName: 'tool-call-name',
                args: { arg1: 'value1', arg2: 'value2' },
              },
            ],
          },
        ],
      }),
    })
    expect(response).toEqual(
      expect.objectContaining({
        text: 'assistant message',
        toolCalls: [
          {
            id: 'tool-call-id',
            name: 'tool-call-name',
            arguments: { arg1: 'value1', arg2: 'value2' },
          },
        ],
        providerLog: expect.objectContaining({
          messages: [
            {
              role: MessageRole.user,
              content: [{ type: 'text', text: 'user message' }],
            },
          ],
          responseText: 'assistant message',
          responseObject: null,
          toolCalls: [
            {
              id: 'tool-call-id',
              name: 'tool-call-name',
              arguments: { arg1: 'value1', arg2: 'value2' },
            },
          ],
        }),
      }),
    )
  })
})
