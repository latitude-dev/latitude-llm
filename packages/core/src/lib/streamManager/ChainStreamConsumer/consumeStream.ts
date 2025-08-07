import { capitalize } from 'lodash-es'

import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { APICallError, RetryError } from 'ai'

import { ProviderData } from '@latitude-data/constants'
import {
  LegacyChainEvent,
  Providers,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { AIReturn } from '../../../services/ai'

interface ConsumeStreamParams {
  result: AIReturn<StreamType>
  controller: ReadableStreamDefaultController
}

type NoRunError = object
type PosibleErrorCode = RunErrorCodes.AIRunError | RunErrorCodes.RateLimit

interface ConsumeStreamResult {
  error?: ChainError<PosibleErrorCode, NoRunError>
}

export async function consumeStream({
  controller,
  result,
}: ConsumeStreamParams): Promise<ConsumeStreamResult> {
  let error: ChainError<PosibleErrorCode, NoRunError> | undefined

  const reader = result.fullStream.getReader()

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    const chunk = value as ProviderData

    if (chunk.type === 'error') {
      error = createAIError(
        getErrorMessage({
          error: chunk.error,
          providerName: result.providerName,
        }),
        getErrorCode(chunk.error),
      )
    }

    if (chunk.type === 'finish') {
      if (chunk.finishReason === 'error' && !error) {
        error = createAIError(
          'LLM provider returned an unknown error',
          RunErrorCodes.AIRunError,
        )
      }
    }

    enqueueChainEvent(controller, {
      event: StreamEventTypes.Provider,
      data: chunk,
    })
  }

  return { error }
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

function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: LegacyChainEvent,
) {
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
    } catch (e) {
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
