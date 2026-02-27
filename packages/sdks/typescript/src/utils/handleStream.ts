import type { Message } from '@latitude-data/constants/messages'
import {
  ApiErrorCodes,
  LatitudeApiError,
  RunErrorCodes,
} from '$sdk/utils/errors'
import { GenerationResponse } from '$sdk/utils/types'
import {
  ChainCallResponseDto,
  ProviderData,
  StreamEventTypes,
  ChainEventTypes,
  LatitudeEventData,
  ChainEvent,
  AssertedStreamType,
} from '@latitude-data/constants'
import { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import { EventSourceParserStream } from 'eventsource-parser/stream'

export async function handleStream<S extends AssertedStreamType = 'text'>({
  body,
  onEvent,
  onToolCall,
  signal,
}: {
  body: ReadableStream<Uint8Array>
  onEvent?: (event: { event: StreamEventTypes; data: ChainEvent['data'] }) => void
  onToolCall: (data: ProviderData) => Promise<void>
  signal?: AbortSignal
}): Promise<GenerationResponse<S> | undefined> {
  let conversation: Message[] = []
  let uuid: string | undefined
  let chainResponse: ChainCallResponseDto<S> | undefined

  const parser = new EventSourceParserStream()
  const decoder = new TextDecoderStream() as TransformStream<Uint8Array, string>
  const textStream = body.pipeThrough(decoder)
  const eventStream = textStream.pipeThrough(parser)
  const reader = eventStream.getReader()

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        reader.cancel('Stream aborted by user').catch(() => {})
      },
      { once: true },
    )
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Skip empty values
      if (!value) continue

      const parsedEvent = value as ParsedEvent | ReconnectInterval
      if (parsedEvent.type === 'event') {
        const data = parseJSON(parsedEvent.data) as ChainEvent['data']
        if (!data) {
          throw new LatitudeApiError({
            status: 500,
            message: `Invalid JSON in server event:\n${parsedEvent.data}`,
            serverResponse: parsedEvent.data,
            errorCode: ApiErrorCodes.InternalServerError,
          })
        }

        onEvent?.({ event: parsedEvent.event as StreamEventTypes, data })

        if (parsedEvent.event === StreamEventTypes.Latitude) {
          uuid = (data as LatitudeEventData).uuid
          conversation = (data as LatitudeEventData).messages

          if (data.type === ChainEventTypes.ChainError) {
            throw new LatitudeApiError({
              status: 500,
              message: data.error.message,
              serverResponse: data.error.message,
              errorCode: RunErrorCodes.AIRunError,
            })
          }

          if (data.type === ChainEventTypes.ProviderCompleted) {
            chainResponse = data.response as unknown as ChainCallResponseDto<S>
          }
        } else if (parsedEvent.event === StreamEventTypes.Provider) {
          if (data.type === 'tool-call') await onToolCall(data)
        }
      }
    }

    if (!uuid || !chainResponse) {
      throw new Error('Stream ended without returning a provider response.')
    }

    const finalResponse = {
      conversation,
      uuid,
      response: chainResponse,
    }

    return finalResponse
  } catch (e) {
    if (e instanceof LatitudeApiError) throw e

    const err = e as Error
    throw new LatitudeApiError({
      status: 500,
      message: err.message,
      serverResponse: err.stack ?? '',
      errorCode: ApiErrorCodes.InternalServerError,
    })
  } finally {
    try {
      reader.releaseLock()
    } catch (e) {
      // Ignore errors during cleanup
      console.warn(
        'Error releasing stream reader lock:',
        e instanceof Error ? e.message : String(e),
      )
    }
  }
}

function parseJSON(line: string) {
  try {
    return JSON.parse(line) as ProviderData | LatitudeEventData
  } catch (_e) {
    // do nothing
  }
}
