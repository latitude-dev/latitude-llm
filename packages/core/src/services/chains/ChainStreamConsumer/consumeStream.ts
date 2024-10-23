import { RunErrorCodes } from '@latitude-data/constants/errors'
import { CoreTool, FinishReason, ObjectStreamPart, TextStreamPart } from 'ai'

import { ChainEvent, StreamEventTypes, StreamType } from '../../../constants'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import { AIReturn, StreamChunk } from '../../ai'
import { ChainError } from '../ChainErrors'

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}

function getErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : null
}

function parseChunks(chunks: StreamChunk[]) {
  let error: ChainError<RunErrorCodes.AIRunError> | undefined
  let finishReason: FinishReason = 'stop'

  for (const chunk of chunks) {
    if (chunk.type === 'error') {
      finishReason = 'error'
      error = new ChainError({
        code: RunErrorCodes.AIRunError,
        message: getErrorMessage(chunk.error) || 'Unknown AI chunk error',
      })
      break
    } else if (chunk.type === 'finish') {
      finishReason = chunk.finishReason
      if (chunk.finishReason === 'error') {
        chunk
        error = new ChainError({
          code: RunErrorCodes.AIRunError,
          message: 'AI run finished with error',
        })
        break
      }
    }
  }

  return { error, finishReason }
}

export type StreamConsumeReturn = ReturnType<typeof parseChunks>

export async function consumeStream({
  controller,
  result,
}: {
  result: AIReturn<StreamType>
  controller: ReadableStreamDefaultController
}) {
  const chunks: StreamChunk[] = []
  for await (const value of streamToGenerator<
    TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
  >(result.data.fullStream)) {
    chunks.push(value)
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Provider,
      data: value,
    })
  }

  return parseChunks(chunks)
}
