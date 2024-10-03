import type { Message } from '@latitude-data/compiler'
import {
  ChainCallResponseDto,
  ChainEventDto,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import env from '$sdk/env'
import { GatewayApiConfig, RouteResolver } from '$sdk/utils'
import { BodyParams, HandlerType, UrlParams } from '$sdk/utils/types'
import { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import { EventSourceParserStream } from 'eventsource-parser/stream'

export type StreamChainResponse = {
  conversation: Message[]
  response: ChainCallResponseDto
}
type StreamResponseCallbacks = {
  onEvent?: ({
    event,
    data,
  }: {
    event: StreamEventTypes
    data: ChainEventDto
  }) => void
  onFinished?: (data: StreamChainResponse) => void
  onError?: (error: Error) => void
}

export class Latitude {
  private projectId?: number
  private apiKey: string
  private routeResolver: RouteResolver

  constructor(
    apiKey: string,
    {
      projectId,
      gateway = {
        host: env.GATEWAY_HOSTNAME,
        port: env.GATEWAY_PORT,
        ssl: env.GATEWAY_SSL,
      },
    }: {
      projectId?: number
      gateway?: GatewayApiConfig
    } = {
      gateway: {
        host: env.GATEWAY_HOSTNAME,
        port: env.GATEWAY_PORT,
        ssl: env.GATEWAY_SSL,
      },
    },
  ) {
    this.routeResolver = new RouteResolver({
      gateway,
      apiVersion: 'v1',
    })
    this.projectId = projectId
    this.apiKey = apiKey
  }

  async run(
    path: string,
    {
      projectId,
      versionUuid,
      parameters,
      onEvent,
      onFinished,
      onError,
    }: {
      projectId?: number
      versionUuid?: string
      parameters?: Record<string, unknown>
    } & StreamResponseCallbacks,
  ) {
    projectId = projectId ?? this.projectId
    if (!projectId) {
      onError?.(new Error('Project ID is required'))
      return
    }

    try {
      const response = await this.request({
        method: 'POST',
        handler: HandlerType.RunDocument,
        params: { projectId, versionUuid },
        body: { path, parameters },
      })

      return this.handleStream({
        stream: response.body!,
        onEvent,
        onFinished,
        onError,
      })
    } catch (err) {
      onError?.(err as Error)
      return
    }
  }

  async chat(
    uuid: string,
    messages: Message[],
    { onEvent, onFinished, onError }: StreamResponseCallbacks = {},
  ) {
    const response = await this.request({
      method: 'POST',
      handler: HandlerType.Chat,
      params: { conversationUuid: uuid },
      body: { messages },
    })
    return this.handleStream({
      stream: response.body!,
      onEvent,
      onFinished,
      onError,
    })
  }

  private async handleStream({
    stream,
    onEvent,
    onFinished,
    onError,
  }: StreamResponseCallbacks & {
    stream: ReadableStream
  }) {
    let conversation: Message[] = []
    let uuid: string | undefined
    let chainResponse: ChainCallResponseDto | undefined

    const parser = new EventSourceParserStream()
    const eventStream = stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(parser)

    try {
      for await (const event of eventStream as unknown as AsyncIterable<
        ParsedEvent | ReconnectInterval
      >) {
        const parsedEvent = event as ParsedEvent | ReconnectInterval

        if (parsedEvent.type === 'event') {
          const data = this.parseJSON(parsedEvent.data)
          if (!data) {
            throw new Error(
              `Invalid JSON in server event:\n${parsedEvent.data}`,
            )
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

  private async request<H extends HandlerType>({
    method,
    handler,
    params,
    body,
  }: {
    handler: H
    params?: UrlParams<H>
    method: 'POST' | 'GET' | 'PUT' | 'DELETE'
    body?: BodyParams<H>
  }) {
    return await fetch(this.routeResolver.resolve({ handler, params }), {
      method,
      headers: this.authHeader,
      body: this.bodyToString(body),
    })
  }

  private parseJSON(line: string) {
    try {
      return JSON.parse(line) as ChainEventDto
    } catch (e) {
      // do nothing
    }
  }

  private get authHeader() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  private bodyToString(body: object = {}) {
    return JSON.stringify(body)
  }
}

export type { ChainEventDto, Message }
