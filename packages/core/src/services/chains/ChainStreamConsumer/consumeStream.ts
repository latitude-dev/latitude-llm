import { CoreTool, ObjectStreamPart, TextStreamPart } from 'ai'

import {
  ChainEvent,
  RunErrorCodes,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { Result } from '../../../lib'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import { AIReturn, StreamChunk } from '../../ai'
import { ChainError } from '../ChainErrors'

function nonErrorChunk(chunk: StreamChunk) {
  return chunk.type !== 'error'
}

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}
/**
 *  We check that chunk type is not 'error'
 *  if not we return the first error chunk
 */
function validate(chunks: StreamChunk[]) {
  const errorChunk = chunks.filter(nonErrorChunk)[0]

  if (!errorChunk) return Result.ok(chunks)

  const error = 'error' in errorChunk ? (errorChunk.error as Error) : undefined
  if (!error) return Result.ok(chunks)

  return Result.error(
    new ChainError({
      code: RunErrorCodes.AIRunError,
      message: error.message,
    }),
  )
}

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

  return validate(chunks)
}
