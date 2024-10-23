import { Readable } from 'stream'

import type { Message } from '@latitude-data/compiler'
import type {
  ChainCallResponseDto,
  ChainEventDto,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import { nodeFetchResponseToReadableStream } from '$sdk/utils/nodeFetchResponseToReadableStream'
import { StreamResponseCallbacks } from '$sdk/utils/types'
import { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import { EventSourceParserStream } from 'eventsource-parser/stream'

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
  onFinished,
  onError,
}: StreamResponseCallbacks & {
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
          throw new Error(`Invalid JSON in server event:\n${parsedEvent.data}`)
        }

        if (parsedEvent.event === 'latitude-event') {
          const messages =
            'messages' in data ? (data.messages! as Message[]) : []

          if (data.type === 'chain-error') {
            throw new Error(data.error.message)
          }

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

    if (!uuid || !chainResponse) return

    const finalResponse = {
      conversation,
      uuid,
      response: chainResponse,
    }

    onFinished?.(finalResponse)

    return finalResponse
  } catch (error) {
    onError?.(error as Error)
  }
}
