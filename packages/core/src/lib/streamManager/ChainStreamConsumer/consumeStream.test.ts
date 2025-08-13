import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { LanguageModelUsage, TextStreamPart, Tool } from 'ai'
import { vi, describe, expect, it } from 'vitest'

import { LegacyChainEvent, Providers, StreamType } from '../../../constants'
import { AIReturn } from '../../../services/ai'
import { consumeStream } from './consumeStream'
import { StreamEventTypes, VercelChunk } from '@latitude-data/constants'

export class AsyncStreamIteable<T> extends ReadableStream<T> {
  [Symbol.asyncIterator] = function () {
    // @ts-expect-error - this is a custom async iterator
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
    providerOptions: new Promise<undefined>(() => undefined),
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
  const fullStream = createMockStream(chunks)
  return new Promise<void>((resolve) => {
    new ReadableStream<LegacyChainEvent>({
      start(controller) {
        callback(controller, buildFakeResult({ fullStream })).then(() => {
          resolve()
        })
      },
    })
  })
}

describe('consumeStream', () => {
  it('return finishReason and no error', async () => {
    await buildFakeChain({
      chunks: [
        { type: 'text-delta', id: '123', text: 'a' },
        {
          ...PARTIAL_FINISH_CHUNK,
          type: 'finish',
          finishReason: 'stop',
        },
      ],
      callback: async (controller, result) => {
        const data = await consumeStream({ controller, result })

        expect(data).toEqual({
          error: undefined,
        })
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
      callback: async (controller, result) => {
        const data = await consumeStream({ controller, result })
        expect(data).toEqual({
          error: new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'LLM provider returned an unknown error',
          }),
        })
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
      ],
      callback: async (controller, result) => {
        const data = await consumeStream({ controller, result })
        expect(data).toEqual({
          error: new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'Openai returned this error: an error happened',
          }),
        })
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
})
