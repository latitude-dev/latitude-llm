import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { LanguageModelUsage, TextStreamPart, Tool } from 'ai'
import { vi, describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { LegacyChainEvent, StreamType } from '../../../constants'
import { AIReturn } from '../../../services/ai'
import { consumeStream } from './consumeStream'
import { StreamEventTypes, VercelChunk } from '@latitude-data/constants'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { ResolvedTools } from '../resolveTools/types'

export class AsyncStreamIteable<T> extends ReadableStream<T> {
  [Symbol.asyncIterator] = function () {
    return this
  }
}

function createMockStream(chunks: VercelChunk[]) {
  return new AsyncStreamIteable<TextStreamPart<TOOLS>>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })
}

const DEFAULT_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
}
export const PARTIAL_FINISH_CHUNK = {
  totalUsage: DEFAULT_USAGE,
  response: {
    id: '1',
    timestamp: new Date(),
    modelId: '1',
  },
}

export type TOOLS = Record<string, Tool>

type BuildChainCallback = (
  controller: ReadableStreamDefaultController<LegacyChainEvent>,
  result: AIReturn<StreamType>,
  accumulatedText: { text: string },
) => Promise<void>

function buildFakeResult({
  fullStream,
}: {
  fullStream: AsyncStreamIteable<TextStreamPart<TOOLS>>
}) {
  return {
    type: 'text' as const,
    toolCalls: [] as unknown as AIReturn<StreamType>['toolCalls'],
    text: new Promise<string>(() => 'text'),
    reasoning: new Promise<string | undefined>(() => undefined),
    usage: new Promise<LanguageModelUsage>(() => DEFAULT_USAGE),
    fullStream,
    providerName: Providers.OpenAI,
    providerMetadata: new Promise<undefined>(() => undefined),
    finishReason: new Promise<'stop' | 'error'>(() => 'stop'),
    response: new Promise(() => ({
      messages: [],
    })) as AIReturn<StreamType>['response'],
  } satisfies AIReturn<StreamType>
}

function buildFakeChain({
  callback,
  chunks,
}: {
  callback: BuildChainCallback
  chunks: TextStreamPart<TOOLS>[]
}) {
  const fullStream = new AsyncStreamIteable<TextStreamPart<TOOLS>>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })
  const result = {
    type: 'text' as const,
    providerName: Providers.OpenAI,
    text: new Promise<string>(() => 'text'),
    reasoning: new Promise<string | undefined>((resolve) => resolve(undefined)),
    usage: new Promise<LanguageModelUsage>(() => DEFAULT_USAGE),
    toolCalls: [],
    fullStream,
    providerMetadata: new Promise<undefined>(() => undefined),
  } as unknown as AIReturn<'text'>
  const accumulatedText = { text: '' }
  return new Promise<void>((resolve) => {
    new ReadableStream<LegacyChainEvent>({
      start(controller) {
        callback(controller, result, accumulatedText).then(() => {
          resolve()
        })
      },
    })
  })
}

describe('consumeStream', () => {
  it('return finishReason and no error', async () => {
    const expectedAccumulatedText = 'This is a test'
    await buildFakeChain({
      chunks: [
        { type: 'text-delta', id: '1', text: 'This' },
        { type: 'text-delta', id: '2', text: ' is' },
        { type: 'text-delta', id: '3', text: ' a' },
        { type: 'text-delta', id: '4', text: ' test' },
        {
          ...PARTIAL_FINISH_CHUNK,
          type: 'finish',
          finishReason: 'stop',
        },
      ],
      callback: async (controller, result, accumulatedText) => {
        const data = await consumeStream({
          controller,
          result,
          accumulatedText,
        })

        expect(data).toEqual({
          error: undefined,
        })
        expect(accumulatedText).toEqual({ text: expectedAccumulatedText })
      },
    })
  })

  it('return error when finishReason is error', async () => {
    await buildFakeChain({
      chunks: [
        { type: 'text-delta', id: '123', text: 'a' },
        {
          ...PARTIAL_FINISH_CHUNK,
          type: 'finish',
          finishReason: 'error',
        },
      ],
      callback: async (controller, result, accumulatedText) => {
        const data = await consumeStream({
          controller,
          result,
          accumulatedText,
        })
        expect(data).toEqual({
          error: new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'LLM provider returned an unknown error',
          }),
        })
        expect(accumulatedText).toEqual({ text: 'a' })
      },
    })
  })

  it('return error when type is error', async () => {
    await buildFakeChain({
      chunks: [
        { type: 'text-delta', id: '123', text: 'a' },
        {
          type: 'error',
          error: new Error('an error happened'),
        },
        { type: 'text-delta', id: '456', text: 'b' },
      ],
      callback: async (controller, result, accumulatedText) => {
        const data = await consumeStream({
          controller,
          result,
          accumulatedText,
        })
        expect(data).toEqual({
          error: new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'Openai returned this error: an error happened',
          }),
        })

        expect(accumulatedText).toEqual({ text: 'a' })
      },
    })
  })

  // This is done to keep compatibility with Vercel SDK v4 which is used in our streaming
  // in our gateway and SDK
  it('transform text-delta chunks from Vercel SDK v5 to v4', async () => {
    const mockEnqueue = vi.fn()
    const fakeController = {
      enqueue: mockEnqueue,
    } as unknown as ReadableStreamDefaultController
    const chunks = [
      {
        type: 'text-delta',
        id: '123',
        text: 'a',
      },
    ] satisfies TextStreamPart<TOOLS>[]

    const mockStream = createMockStream(chunks)

    await consumeStream({
      controller: fakeController,
      result: buildFakeResult({ fullStream: mockStream }),
      accumulatedText: { text: '' },
    })

    expect(mockEnqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Provider,
      data: {
        type: 'text-delta',
        id: '123',
        textDelta: 'a',
        providerMetadata: undefined,
      },
    })
  })

  it('injects _sourceData when resolvedTools is provided for tool-call', async () => {
    const mockEnqueue = vi.fn()
    const fakeController = {
      enqueue: mockEnqueue,
    } as unknown as ReadableStreamDefaultController

    const resolvedTools: ResolvedTools = {
      myTool: {
        definition: {
          type: 'function',
          function: {
            name: 'myTool',
            description: 'A test tool',
            parameters: {},
          },
        } as unknown as Tool,
        sourceData: {
          source: ToolSource.Client,
        },
      },
    }

    const chunks = [
      {
        type: 'tool-call',
        toolCallId: 'call-123',
        toolName: 'myTool',
        input: { arg: 'value' },
      },
    ] satisfies TextStreamPart<TOOLS>[]

    const mockStream = createMockStream(chunks)

    await consumeStream({
      controller: fakeController,
      result: buildFakeResult({ fullStream: mockStream }),
      accumulatedText: { text: '' },
      resolvedTools,
    })

    expect(mockEnqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Provider,
      data: {
        type: 'tool-call',
        toolCallId: 'call-123',
        toolName: 'myTool',
        args: { arg: 'value' },
        _sourceData: {
          source: ToolSource.Client,
        },
      },
    })
  })

  it('does not inject _sourceData when resolvedTools is not provided', async () => {
    const mockEnqueue = vi.fn()
    const fakeController = {
      enqueue: mockEnqueue,
    } as unknown as ReadableStreamDefaultController

    const chunks = [
      {
        type: 'tool-call',
        toolCallId: 'call-456',
        toolName: 'unknownTool',
        input: { arg: 'value' },
      },
    ] satisfies TextStreamPart<TOOLS>[]

    const mockStream = createMockStream(chunks)

    await consumeStream({
      controller: fakeController,
      result: buildFakeResult({ fullStream: mockStream }),
      accumulatedText: { text: '' },
    })

    expect(mockEnqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Provider,
      data: {
        type: 'tool-call',
        toolCallId: 'call-456',
        toolName: 'unknownTool',
        args: { arg: 'value' },
      },
    })
  })

  it('does not inject _sourceData when tool is not in resolvedTools', async () => {
    const mockEnqueue = vi.fn()
    const fakeController = {
      enqueue: mockEnqueue,
    } as unknown as ReadableStreamDefaultController

    const resolvedTools: ResolvedTools = {
      myTool: {
        definition: {
          type: 'function',
          function: {
            name: 'myTool',
            description: 'A test tool',
            parameters: {},
          },
        } as unknown as Tool,
        sourceData: {
          source: ToolSource.Client,
        },
      },
    }

    const chunks = [
      {
        type: 'tool-call',
        toolCallId: 'call-789',
        toolName: 'differentTool',
        input: { arg: 'value' },
      },
    ] satisfies TextStreamPart<TOOLS>[]

    const mockStream = createMockStream(chunks)

    await consumeStream({
      controller: fakeController,
      result: buildFakeResult({ fullStream: mockStream }),
      accumulatedText: { text: '' },
      resolvedTools,
    })

    expect(mockEnqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Provider,
      data: {
        type: 'tool-call',
        toolCallId: 'call-789',
        toolName: 'differentTool',
        args: { arg: 'value' },
      },
    })
  })

  it('injects _sourceData with Agent source type', async () => {
    const mockEnqueue = vi.fn()
    const fakeController = {
      enqueue: mockEnqueue,
    } as unknown as ReadableStreamDefaultController

    const resolvedTools: ResolvedTools = {
      agentTool: {
        definition: {
          type: 'function',
          function: {
            name: 'agentTool',
            description: 'An agent tool',
            parameters: {},
          },
        } as unknown as Tool,
        sourceData: {
          source: ToolSource.Agent,
          agentPath: '/path/to/agent',
          documentUuid: 'doc-uuid-123',
          documentLogUuid: 'log-uuid-456',
        },
      },
    }

    const chunks = [
      {
        type: 'tool-call',
        toolCallId: 'call-agent',
        toolName: 'agentTool',
        input: { question: 'What is the answer?' },
      },
    ] satisfies TextStreamPart<TOOLS>[]

    const mockStream = createMockStream(chunks)

    await consumeStream({
      controller: fakeController,
      result: buildFakeResult({ fullStream: mockStream }),
      accumulatedText: { text: '' },
      resolvedTools,
    })

    expect(mockEnqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Provider,
      data: {
        type: 'tool-call',
        toolCallId: 'call-agent',
        toolName: 'agentTool',
        args: { question: 'What is the answer?' },
        _sourceData: {
          source: ToolSource.Agent,
          agentPath: '/path/to/agent',
          documentUuid: 'doc-uuid-123',
          documentLogUuid: 'log-uuid-456',
        },
      },
    })
  })

  it('injects _sourceData with Integration source type', async () => {
    const mockEnqueue = vi.fn()
    const fakeController = {
      enqueue: mockEnqueue,
    } as unknown as ReadableStreamDefaultController

    const resolvedTools: ResolvedTools = {
      integrationTool: {
        definition: {
          type: 'function',
          function: {
            name: 'integrationTool',
            description: 'An integration tool',
            parameters: {},
          },
        } as unknown as Tool,
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 42,
          toolLabel: 'My Integration',
          imageUrl: 'https://example.com/image.png',
        },
      },
    }

    const chunks = [
      {
        type: 'tool-call',
        toolCallId: 'call-integration',
        toolName: 'integrationTool',
        input: { data: 'test' },
      },
    ] satisfies TextStreamPart<TOOLS>[]

    const mockStream = createMockStream(chunks)

    await consumeStream({
      controller: fakeController,
      result: buildFakeResult({ fullStream: mockStream }),
      accumulatedText: { text: '' },
      resolvedTools,
    })

    expect(mockEnqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Provider,
      data: {
        type: 'tool-call',
        toolCallId: 'call-integration',
        toolName: 'integrationTool',
        args: { data: 'test' },
        _sourceData: {
          source: ToolSource.Integration,
          integrationId: 42,
          toolLabel: 'My Integration',
          imageUrl: 'https://example.com/image.png',
        },
      },
    })
  })

  // TODO: Review if we need to parse diferently reasoning chunks.
})
