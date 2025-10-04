import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { LanguageModelUsage, TextStreamPart, Tool } from 'ai'
import { describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { LegacyChainEvent, StreamType } from '../../../constants'
import { AIReturn } from '../../../services/ai'
import { consumeStream } from './consumeStream'

export class AsyncStreamIteable<T> extends ReadableStream<T> {
  [Symbol.asyncIterator] = function () {
    // @ts-ignore
    return this
  }
}

const DEFAULT_USAGE: LanguageModelUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
}
export const PARTIAL_FINISH_CHUNK = {
  usage: DEFAULT_USAGE,
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
    toolCalls: [] as any,
    text: new Promise<string>(() => 'text'),
    reasoning: new Promise<string | undefined>((resolve) => resolve(undefined)),
    usage: new Promise<LanguageModelUsage>(() => DEFAULT_USAGE),
    fullStream,
    providerName: Providers.OpenAI,
    providerMetadata: new Promise<undefined>(() => undefined),
  }
  const accumulatedText = { text: '' }
  return new Promise<void>((resolve) => {
    new ReadableStream<LegacyChainEvent>({
      start(controller) {
        // @ts-ignore - we mock result's props
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
        { type: 'text-delta', textDelta: 'This' },
        { type: 'text-delta', textDelta: ' is' },
        { type: 'text-delta', textDelta: ' a' },
        { type: 'text-delta', textDelta: ' test' },
        {
          ...PARTIAL_FINISH_CHUNK,
          type: 'finish',
          finishReason: 'stop',
          providerMetadata: undefined,
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
        { type: 'text-delta', textDelta: 'a' },
        {
          ...PARTIAL_FINISH_CHUNK,
          type: 'finish',
          finishReason: 'error',
          providerMetadata: undefined,
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
        { type: 'text-delta', textDelta: 'a' },
        {
          type: 'error',
          error: new Error('an error happened'),
        },
        { type: 'text-delta', textDelta: 'b' },
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

        expect(accumulatedText).toEqual({ text: 'ab' })
      },
    })
  })
})
