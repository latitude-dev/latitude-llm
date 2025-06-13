import { Readable } from 'stream'

import type { Message, ToolCall } from '@latitude-data/constants'
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
  extractAgentToolCalls,
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

  const reader = eventStream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Skip empty values
      if (!value) continue

      const parsedEvent = value as ParsedEvent | ReconnectInterval
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

        onEvent?.({ event: parsedEvent.event as StreamEventTypes, data })

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
      }
    }

    if (!uuid || !chainResponse) {
      throw new Error('Stream ended without returning a provider response.')
    }

    const [agentTools, otherTools] = extractAgentToolCalls(toolsRequested)

    const finalResponse = {
      conversation,
      uuid,
      response: chainResponse,
      toolRequests: otherTools,
      agentResponse: agentTools[0]?.arguments,
    }

    return finalResponse
  } catch (e) {
    let error = e as LatitudeApiError
    if (!(e instanceof LatitudeApiError)) {
      const err = e as Error
      error = new LatitudeApiError({
        status: 402,
        message: err.message,
        serverResponse: err.stack ?? '',
        errorCode: ApiErrorCodes.InternalServerError,
      })
    }

    onError?.(error)

    throw error
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
