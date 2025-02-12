import { capitalize } from 'lodash-es'

import { RunErrorCodes } from '@latitude-data/constants/errors'
import {
  APICallError,
  CoreTool,
  FinishReason,
  ObjectStreamPart,
  TextStreamPart,
} from 'ai'

import {
  LegacyChainEvent,
  Providers,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { streamToGenerator } from '../../streamToGenerator'
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
  event: LegacyChainEvent,
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
  if (error instanceof APICallError) {
    try {
      const body = error.responseBody ? JSON.parse(error.responseBody) : null

      if (!Array.isArray(body) || body.length === 0) {
        return `${intro}: ${error.message}`
      }

      return `${intro}: ${body
        .map((item) => {
          const error = item.error
          if (!error) return JSON.stringify(item)

          return item.error.message
        })
        .join(', ')}`
    } catch (e) {
      console.error(e)
      return `${intro}: ${error.message}`
    }
  }

  if (error instanceof Error) {
    return `${intro}: ${error.message}`
  }

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
