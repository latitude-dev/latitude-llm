import { RunErrorCodes } from '@latitude-data/constants/errors'
import { CoreTool, FinishReason, ObjectStreamPart, TextStreamPart } from 'ai'

import { ChainEvent, StreamEventTypes, StreamType } from '../../../constants'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import { AIReturn } from '../../ai'
import { ChainError } from '../ChainErrors'

type StreamChunk =
  | TextStreamPart<Record<string, CoreTool>>
  | ObjectStreamPart<unknown>

interface ConsumeStreamParams {
  result: AIReturn<StreamType>
  controller: ReadableStreamDefaultController
}

interface ConsumeStreamResult {
  error?: ChainError<RunErrorCodes.AIRunError>
  finishReason: FinishReason
}

function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}

function createAIError(message: string): ChainError<RunErrorCodes.AIRunError> {
  return new ChainError({
    code: RunErrorCodes.AIRunError,
    message,
  })
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown AI chunk error'
}

export async function consumeStream({
  controller,
  result,
}: ConsumeStreamParams): Promise<ConsumeStreamResult> {
  let error: ChainError<RunErrorCodes.AIRunError> | undefined
  let finishReason: FinishReason = 'stop'

  for await (const chunk of streamToGenerator<StreamChunk>(
    result.data.fullStream,
  )) {
    if (chunk.type === 'error') {
      finishReason = 'error'
      error = createAIError(getErrorMessage(chunk.error))
      break
    }

    if (chunk.type === 'finish') {
      finishReason = chunk.finishReason

      if (chunk.finishReason === 'error') {
        error = createAIError('AI run finished with error')
        break
      }
    }

    enqueueChainEvent(controller, {
      event: StreamEventTypes.Provider,
      data: chunk,
    })
  }

  return { error, finishReason }
}
