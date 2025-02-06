import { capitalize } from 'lodash-es'

import { RunErrorCodes } from '@latitude-data/constants/errors'
import { CoreTool, FinishReason, ObjectStreamPart, TextStreamPart } from 'ai'

import {
  ChainEvent,
  Providers,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import { AIReturn } from '../../../services/ai'
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

function getErrorMessage({
  error,
  providerName,
}: {
  error: unknown
  providerName: Providers
}): string {
  const intro = `${capitalize(providerName)} returned this error`
  if (error instanceof Error) return `${intro}: ${error.message}`

  try {
    return `${intro}: ${JSON.stringify(error)}`
  } catch (e) {
    return `${intro}: Unknown error`
  }
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
      error = createAIError(
        getErrorMessage({
          error: chunk.error,
          providerName: result.data.providerName,
        }),
      )
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
