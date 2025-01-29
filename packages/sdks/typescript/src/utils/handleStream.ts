import { Readable } from 'stream'

import type { Message } from '@latitude-data/compiler'
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
  ChainEventDto,
  StreamEventTypes,
} from '@latitude-data/constants/ai'

function parseJSON(line: string) {
  try {
    return JSON.parse(line) as ChainEventDto
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
        const data = parseJSON(parsedEvent.data)

        if (!data) {
          throw new LatitudeApiError({
            status: 402,
            message: `Invalid JSON in server event:\n${parsedEvent.data}`,
            serverResponse: parsedEvent.data,
            errorCode: ApiErrorCodes.InternalServerError,
          })
        }

        if (parsedEvent.event === 'latitude-event') {
          if (data.type === 'chain-error') {
            throw new LatitudeApiError({
              status: 402,
              message: data.error.message,
              serverResponse: JSON.stringify(data.error),
              errorCode: RunErrorCodes.AIRunError,
            })
          }

          const messages =
            'messages' in data ? (data.messages! as Message[]) : []

          if (messages.length > 0) {
            conversation.push(...messages)
          }

          if (data.type === 'chain-complete') {
            uuid = data.uuid!
            chainResponse = data.response!
          }
        }

        onEvent?.({ event: parsedEvent.event as StreamEventTypes, data })
      }
    }

    if (!uuid || !chainResponse) {
      throw new Error(
        'Stream ended without a chain-complete event. Missing uuid or response.',
      )
    }

    const finalResponse = {
      conversation,
      uuid,
      response: chainResponse,
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
    onError?.(error)
    return Promise.reject(error)
  }
}
