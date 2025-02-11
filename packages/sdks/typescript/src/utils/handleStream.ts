import { Readable } from 'stream'

import type { Message, ToolCall } from '@latitude-data/compiler'
import {
  ApiErrorCodes,
  LatitudeApiError,
  RunErrorCodes,
} from '$sdk/utils/errors'
import { nodeFetchResponseToReadableStream } from '$sdk/utils/nodeFetchResponseToReadableStream'
import { StreamResponseCallbacks } from '$sdk/utils/types'
import { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import { EventSourceParserStream } from 'eventsource-parser/stream'
import {
  ChainCallResponseDto,
  ProviderData,
  StreamEventTypes,
  ChainEventTypes,
  LatitudeEventData,
} from '@latitude-data/constants'

function parseJSON(line: string) {
  try {
    return JSON.parse(line) as ProviderData | LatitudeEventData
  } catch (e) {
    // do nothing
  }
}

export async function handleStream({
  body,
  onEvent,
  onError,
}: Omit<StreamResponseCallbacks, 'onFinished'> & {
  body: Readable
}) {
  let conversation: Message[] = []
  let uuid: string | undefined
  let chainResponse: ChainCallResponseDto | undefined
  let toolsRequested: ToolCall[] = []

  const parser = new EventSourceParserStream()
  const stream = nodeFetchResponseToReadableStream(body, onError)
  const eventStream = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(parser)

  try {
    for await (const event of eventStream as unknown as AsyncIterable<
      ParsedEvent | ReconnectInterval
    >) {
      const parsedEvent = event as ParsedEvent | ReconnectInterval

      if (parsedEvent.type === 'event') {
        const data = parseJSON(parsedEvent.data) as LatitudeEventData

        if (!data) {
          throw new LatitudeApiError({
            status: 402,
            message: `Invalid JSON in server event:\n${parsedEvent.data}`,
            serverResponse: parsedEvent.data,
            errorCode: ApiErrorCodes.InternalServerError,
          })
        }

        if (parsedEvent.event === StreamEventTypes.Latitude) {
          uuid = data.uuid
          conversation = data.messages

          if (data.type === ChainEventTypes.ChainError) {
            throw new LatitudeApiError({
              status: 402,
              message: data.error.message,
              serverResponse: data.error.message,
              errorCode: RunErrorCodes.AIRunError,
            })
          }

          if (data.type === ChainEventTypes.ProviderCompleted) {
            chainResponse = data.response
          }

          if (data.type === ChainEventTypes.ToolsRequested) {
            toolsRequested = data.tools
          }
        }

        onEvent?.({ event: parsedEvent.event as StreamEventTypes, data })
      }
    }

    if (!uuid || !chainResponse) {
      throw new Error('Stream ended without returning a provider response.')
    }

    const finalResponse = {
      conversation,
      uuid,
      response: chainResponse,
      toolRequests: toolsRequested,
    }

    return finalResponse
  } catch (e) {
    let error: LatitudeApiError

    if (e instanceof LatitudeApiError) {
      error = e as LatitudeApiError
    } else {
      const err = e as Error
      error = new LatitudeApiError({
        status: 402,
        message: err.message,
        serverResponse: err.stack ?? '',
        errorCode: ApiErrorCodes.InternalServerError,
      })
    }
    return Promise.reject(error)
  }
}
