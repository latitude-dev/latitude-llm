import { capitalize } from 'lodash-es'

import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { APICallError, RetryError } from 'ai'

import { ProviderData, VercelChunk } from '@latitude-data/constants'
import {
  LegacyChainEvent,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { Providers } from '@latitude-data/constants'
import { AIReturn } from '../../../services/ai'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'

type ConsumeStreamParams = {
  result: AIReturn<StreamType>
  controller: ReadableStreamDefaultController
  accumulatedText: { text: string }
  resolvedTools?: ResolvedToolsDict
}

type NoRunError = object
type PosibleErrorCode = RunErrorCodes.AIRunError | RunErrorCodes.RateLimit

interface ConsumeStreamResult {
  error?: ChainError<PosibleErrorCode, NoRunError>
}

export async function consumeStream({
  controller,
  result,
  accumulatedText: _accumulatedText,
  resolvedTools,
}: ConsumeStreamParams): Promise<ConsumeStreamResult> {
  let error: ChainError<PosibleErrorCode, NoRunError> | undefined
  let reader: ReadableStreamDefaultReader | null = null

  try {
    reader = result.fullStream.getReader()

    while (true) {
      if (error) break

      const { value, done } = await reader.read()
      if (done) break

      const vercelChunk = value as VercelChunk
      let chunk = value as ProviderData

      if (vercelChunk.type === 'text-delta') {
        chunk = {
          type: 'text-delta',
          id: vercelChunk.id,
          textDelta: vercelChunk.text,
          providerMetadata: vercelChunk.providerMetadata,
        } as ProviderData

        _accumulatedText.text += vercelChunk.text
      } else if (vercelChunk.type === 'tool-call') {
        const resolvedTool = resolvedTools?.[vercelChunk.toolName]
        chunk = {
          type: 'tool-call',
          toolCallId: vercelChunk.toolCallId,
          toolName: vercelChunk.toolName,
          args: vercelChunk.input,
          ...(resolvedTool ? { _sourceData: resolvedTool.sourceData } : {}),
        } as ProviderData
      } else if (vercelChunk.type === 'tool-result') {
        chunk = {
          type: 'tool-result',
          toolCallId: vercelChunk.toolCallId,
          toolName: vercelChunk.toolName,
          args: vercelChunk.input,
          result: vercelChunk.output,
        } as ProviderData
      } else if (chunk.type === 'error') {
        error = createAIError(
          getErrorMessage({
            error: chunk.error,
            providerName: result.providerName,
          }),
          getErrorCode(chunk.error),
        )
      } else if (vercelChunk.type === 'finish') {
        if (vercelChunk.finishReason === 'error' && !error) {
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
  } finally {
    if (reader) {
      try {
        reader.releaseLock()
      } catch (e) {
        // Ignore errors during cleanup - lock may already be released
      }
    }
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
