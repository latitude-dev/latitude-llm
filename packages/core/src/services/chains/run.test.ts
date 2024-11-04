import {
  Chain,
  ContentType,
  Conversation,
  MessageRole,
} from '@latitude-data/compiler'
import { v4 as uuid } from 'uuid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { objectToString, Workspace } from '../../browser'
import { ErrorableEntity, LogSources, Providers } from '../../constants'
import { Result } from '../../lib'
import * as factories from '../../tests/factories'
import * as aiModule from '../ai'
import { setCachedResponse } from '../commits/promptCache'
import * as chainValidatorModule from './ChainValidator'
import { runChain } from './run'

// Mock other dependencies
vi.mock('@latitude-data/compiler')
vi.mock('uuid')

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
      data: {
        text: Promise.resolve(text),
        usage: Promise.resolve({ totalTokens }),
        toolCalls: Promise.resolve([]),
        providerLog: Promise.resolve({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
        }),
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text', text })
            controller.close()
          },
        }),
      },
    })
  }

  let workspace: Workspace

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(uuid).mockReturnValue(mockUUID)

    const { workspace: w, providers } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
    })
    providersMap = new Map(providers.map((p) => [p.name, p]))
    workspace = w
  })

  it('runs a chain without schema override', async () => {
    const mockAiResponse = createMockAiResponse('AI response', 10)

    vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any)
    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
    })

    const response = await run.response
    expect(response.value).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        text: 'AI response',
        usage: { totalTokens: 10 },
        toolCalls: [],
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
        schema: undefined,
        output: 'no-schema',
      }),
    )
  })

  it('runs a chain with schema override', async () => {
    const mockSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    } as const

    const mockAiResponse = Result.ok({
      type: 'object',
      data: {
        object: Promise.resolve({ name: 'John', age: 30 }),
        usage: Promise.resolve({ totalTokens: 15 }),
        providerLog: Promise.resolve({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
        }),
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'object',
              object: { name: 'John', age: 30 },
            })
            controller.close()
          },
        }),
      },
    })

    vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any)

    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
      configOverrides: {
        schema: mockSchema,
        output: 'object',
      },
    })

    const response = await run.response
    expect(response.value).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        object: { name: 'John', age: 30 },
        text: objectToString({ name: 'John', age: 30 }),
        usage: { totalTokens: 15 },
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
        schema: mockSchema,
        output: 'object',
      }),
    )
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
        conversation: {
          messages: [
            {
              role: MessageRole.user,
              content: [{ type: ContentType.text, text: 'Step 1' }],
            },
          ],
          config: { provider: 'openai', model: 'gpt-3.5-turbo' },
        },
      })
      .mockResolvedValueOnce({
        completed: true,
        conversation: {
          messages: [
            {
              role: MessageRole.user,
              content: [{ type: ContentType.text, text: 'Step 1' }],
            },
            {
              role: MessageRole.assistant,
              content: 'AI response 1',
              toolCalls: [],
            },
            {
              role: MessageRole.user,
              content: [{ type: ContentType.text, text: 'Step 2' }],
            },
          ],
          config: { provider: 'openai', model: 'gpt-3.5-turbo' },
        },
      })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
    })

    const response = await run.response
    expect(response.value).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        text: 'AI response 2',
        usage: { totalTokens: 15 },
        toolCalls: [],
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledTimes(2)
  })

  it('handles system messages correctly', async () => {
    const mockAiResponse = createMockAiResponse('AI response', 10)
    vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any)

    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.system,
            content: 'System instruction',
          },
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'User message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
    })

    const response = await run.response
    expect(response.value).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        text: 'AI response',
        usage: { totalTokens: 10 },
        toolCalls: [],
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: MessageRole.system, content: 'System instruction' },
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'User message' }],
          },
        ],
      }),
    )
  })

  it('runs a chain with object schema and output', async () => {
    const mockSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    } as const

    const mockAiResponse = Result.ok({
      type: 'object',
      data: {
        object: Promise.resolve({ name: 'John', age: 30 }),
        usage: Promise.resolve({ totalTokens: 15 }),
        providerLog: Promise.resolve({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
        }),
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'object',
              object: { name: 'John', age: 30 },
            })
            controller.close()
          },
        }),
      },
    })

    vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any)

    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
      configOverrides: {
        schema: mockSchema,
        output: 'object',
      },
    })

    const response = await run.response
    expect(response.value).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        object: { name: 'John', age: 30 },
        text: objectToString({ name: 'John', age: 30 }),
        usage: { totalTokens: 15 },
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledWith({
      messages: [
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Test message' }],
        },
      ],
      config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      provider: providersMap.get('openai'),
      schema: mockSchema,
      output: 'object',
    })
  })

  it('runs a chain with array schema and output', async () => {
    const mockSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      },
    } as const

    const mockAiResponse = Result.ok({
      type: 'object',
      data: {
        object: Promise.resolve([
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ]),
        providerLog: Promise.resolve({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
        }),
        usage: Promise.resolve({ totalTokens: 20 }),
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'object',
              object: [
                { name: 'John', age: 30 },
                { name: 'Jane', age: 25 },
              ],
            })
            controller.close()
          },
        }),
      },
    })

    vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any)

    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
      configOverrides: {
        schema: mockSchema,
        output: 'array',
      },
    })

    const response = await run.response
    expect(response.value).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        object: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ],
        text: objectToString([
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ]),
        usage: { totalTokens: 20 },
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: mockSchema,
        output: 'array',
      }),
    )
  })

  it('runs a chain with no-schema output', async () => {
    const mockAiResponse = createMockAiResponse(
      'AI response without schema',
      10,
    )
    vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any)

    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
      configOverrides: {
        output: 'no-schema',
      },
    })

    const response = await run.response
    expect(response.value).toEqual(
      expect.objectContaining({
        documentLogUuid: expect.any(String),
        text: 'AI response without schema',
        usage: { totalTokens: 10 },
        toolCalls: [],
      }),
    )

    expect(aiModule.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        output: 'no-schema',
      }),
    )
  })

  it('returns a nicely formatted response text when the response contains a tool call', async () => {
    const mockAiResponse = Result.ok({
      type: 'text',
      data: {
        text: Promise.resolve(''),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        toolCalls: Promise.resolve([
          {
            toolCallId: 'tool-call-id',
            toolName: 'tool-call-name',
            args: { foo: 'bar' },
          },
        ]),
        providerLog: Promise.resolve({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
        }),
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text', text: '' })
            controller.close()
          },
        }),
      },
    })
    vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any)
    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })

    const run = await runChain({
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      errorableType: ErrorableEntity.DocumentLog,
    })

    const res = await run.response

    expect(res.value).toEqual(
      expect.objectContaining({
        toolCalls: [
          {
            id: 'tool-call-id',
            name: 'tool-call-name',
            arguments: { foo: 'bar' },
          },
        ],
      }),
    )
  })

  describe('with cached response', () => {
    let config = { provider: 'openai', model: 'gpt-3.5-turbo' }
    let conversation = {
      messages: [
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Test message' }],
        },
      ],
      config,
    } as Conversation

    beforeEach(async () => {
      vi.mocked(mockChain.step!).mockResolvedValue({
        completed: true,
        conversation,
      })

      vi.spyOn(chainValidatorModule, 'ChainValidator').mockImplementation(
        () => {
          return {
            call: vi.fn().mockResolvedValue(
              Result.ok({
                chainCompleted: true,
                config,
                conversation,

                provider: providersMap.get('openai'),
              }),
            ),
          } as any
        },
      )
    })

    it('returns the cached response', async () => {
      await setCachedResponse({
        workspace,
        config,
        conversation,
        response: {
          streamType: 'text',
          text: 'cached response',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          toolCalls: [],
        },
      })
      const run = await runChain({
        workspace,
        chain: mockChain as Chain,
        providersMap,
        source: LogSources.API,
        errorableType: ErrorableEntity.DocumentLog,
      })
      const spy = vi.spyOn(aiModule, 'ai')
      const res = await run.response

      expect(spy).not.toHaveBeenCalled()
      expect(res.value).toEqual(
        expect.objectContaining({ text: 'cached response' }),
      )
    })

    describe('with config having temperature != 0', () => {
      beforeEach(() => {
        // @ts-expect-error - mock
        config.temperature = 0.5
      })

      it('returns the cached response', async () => {
        await setCachedResponse({
          workspace,
          config,
          conversation,
          response: {
            streamType: 'text',
            text: 'cached response',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
            toolCalls: [],
          },
        })
        const mockAiResponse = createMockAiResponse('AI response', 10)

        const spy = vi
          .spyOn(aiModule, 'ai')
          .mockResolvedValue(mockAiResponse as any)

        const run = await runChain({
          workspace,
          chain: mockChain as Chain,
          providersMap,
          source: LogSources.API,
          errorableType: ErrorableEntity.DocumentLog,
        })
        const result = await run.response

        expect(spy).toHaveBeenCalled()
        expect(result.ok).toEqual(true)
        expect(result.value).not.toEqual(
          expect.objectContaining({ text: 'cached response' }),
        )
      })
    })

    describe('with conversation having multiple steps', () => {
      beforeEach(() => {
        vi.spyOn(chainValidatorModule, 'ChainValidator').mockImplementation(
          () => {
            return {
              call: vi
                .fn()
                .mockResolvedValue(
                  Result.ok({ chainCompleted: false, config, conversation }),
                )
                .mockResolvedValue(
                  Result.ok({
                    chainCompleted: true,
                    config,
                    conversation,
                    provider: providersMap.get('openai'),
                  }),
                ),
            } as any
          },
        )
      })

      it('returns the cached response first and then calls ai module', async () => {
        await setCachedResponse({
          workspace,
          config,
          conversation,
          response: {
            streamType: 'text',
            text: 'cached response',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
            toolCalls: [],
          },
        })

        const mockAiResponse = createMockAiResponse('AI response', 10)
        const spy = vi
          .spyOn(aiModule, 'ai')
          .mockResolvedValue(mockAiResponse as any)

        const run = await runChain({
          workspace,
          chain: mockChain as Chain,
          providersMap,
          source: LogSources.API,
          errorableType: ErrorableEntity.DocumentLog,
        })

        const result = await run.response

        expect(spy).toHaveBeenCalledOnce()
        expect(result.ok).toEqual(true)
      })
    })
  })
})
