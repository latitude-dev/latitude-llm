import { capitalize } from 'lodash-es'

import { APICallError, type FinishReason, RetryError } from 'ai'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

import {
  type LegacyChainEvent,
  type Providers,
  StreamEventTypes,
  type StreamType,
} from '../../../../constants'
import type { AIReturn } from '../../../../services/ai'
import type { ProviderData } from '@latitude-data/constants'
import { streamToGenerator } from '../../../../lib/streamToGenerator'

interface ConsumeStreamParams {
  result: AIReturn<StreamType>
  controller: ReadableStreamDefaultController
}

type NoRunError = object
type PosibleErrorCode = RunErrorCodes.AIRunError | RunErrorCodes.RateLimit

interface ConsumeStreamResult {
  error?: ChainError<PosibleErrorCode, NoRunError>
  finishReason: FinishReason
}

export async function consumeStream({
  controller,
  result,
}: ConsumeStreamParams): Promise<ConsumeStreamResult> {
  let error: ChainError<PosibleErrorCode, NoRunError> | undefined
  let finishReason: FinishReason = 'stop'

  for await (const chunk of streamToGenerator<ProviderData>(result.fullStream)) {
    if (chunk.type === 'error') {
      finishReason = 'error'
      error = createAIError(
        getErrorMessage({
          error: chunk.error,
          providerName: result.providerName,
        }),
        getErrorCode(chunk.error),
      )

      break
    }

    if (chunk.type === 'finish') {
      finishReason = chunk.finishReason

      if (chunk.finishReason === 'error') {
        error = createAIError('AI run finished with error', RunErrorCodes.AIRunError)
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

function getErrorCode(error: unknown) {
  if (error instanceof RetryError) {
    if (error.lastError instanceof APICallError) {
      if (error.lastError.statusCode === 429) {
        return RunErrorCodes.RateLimit
      }
    }
  }

  if (error instanceof APICallError) {
    if (error.statusCode === 429) {
      return RunErrorCodes.RateLimit
    }
  }

  return RunErrorCodes.AIRunError
}

function enqueueChainEvent(controller: ReadableStreamDefaultController, event: LegacyChainEvent) {
  controller.enqueue(event)
}

function createAIError(
  message: string,
  code: PosibleErrorCode,
): ChainError<PosibleErrorCode, NoRunError> {
  return new ChainError<PosibleErrorCode, NoRunError>({
    code,
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
    } catch (_e) {
      return `${intro}: ${error.message}`
    }
  }

  if (error instanceof Error) {
    return `${intro}: ${error.message}`
  }

  try {
    return `${intro}: ${JSON.stringify(error)}`
  } catch (_e) {
    return `${intro}: Unknown error`
  }
}
