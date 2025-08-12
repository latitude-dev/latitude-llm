import { capitalize } from 'lodash-es'

import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { APICallError, FinishReason, RetryError } from 'ai'

import { ProviderData, VercelChunk } from '@latitude-data/constants'
import {
  LegacyChainEvent,
  Providers,
  StreamEventTypes,
  StreamType,
} from '../../../../constants'
import { streamToGenerator } from '../../../../lib/streamToGenerator'
import { AIReturn } from '../../../../services/ai'

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

  for await (const value of streamToGenerator<VercelChunk>(result.fullStream)) {
    const vercelChunk = value as VercelChunk
    let chunk = value as ProviderData

    if (vercelChunk.type === 'text-delta') {
      chunk = {
        type: 'text-delta',
        id: vercelChunk.id,
        textDelta: vercelChunk.text,
        providerMetadata: vercelChunk.providerMetadata,
      } as ProviderData
    } else if (vercelChunk.type === 'tool-call') {
      chunk = {
        type: 'tool-call',
        toolCallId: vercelChunk.toolCallId,
        toolName: vercelChunk.toolName,
        args: vercelChunk.input,
      } as ProviderData
    } else if (vercelChunk.type === 'tool-result') {
      chunk = {
        type: 'tool-result',
        toolCallId: vercelChunk.toolCallId,
        toolName: vercelChunk.toolName,
        args: vercelChunk.input,
        result: vercelChunk.output,
      } as ProviderData
    } else if (vercelChunk.type === 'reasoning-delta') {
      chunk = {
        type: 'reasoning',
        textDelta: vercelChunk.text,
      } as ProviderData
    } else if (chunk.type === 'error') {
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
        error = createAIError(
          'AI run finished with error',
          RunErrorCodes.AIRunError,
        )
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
  const intro = `${providerName.toLowerCase() === Providers.Custom ? 'Custom provider' : capitalize(providerName)} returned this error`
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
