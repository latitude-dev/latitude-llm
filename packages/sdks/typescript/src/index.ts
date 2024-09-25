import type { Message } from '@latitude-data/compiler'
import {
  ChainCallResponseDto,
  ChainEventDto,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import env from '$sdk/env'
import { GatewayApiConfig, RouteResolver } from '$sdk/utils'
import { BodyParams, HandlerType, UrlParams } from '$sdk/utils/types'

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
    const consumeEvent = (event: { event: string; data: string }) => {
      if (!event.event) {
        onError?.(new Error(`Invalid SSE event: ${event}`))
        return
      }
      if (!event.data) {
        onError?.(new Error(`Invalid data in server event:\n${event}`))
        return
      }
      if (event.event === 'error') {
        onError?.(new Error(event.data))
        return
      }

      const json = this.parseJSON(event.data)
      if (!json) {
        const error = new Error(`Invalid JSON in server event:\n${event}`)
        onError?.(error)
        return
      }

      if (event.event === 'latitude-event') {
        const messages = 'messages' in json ? (json.messages! as Message[]) : []

        if (json.type === 'chain-error') {
          const error = new Error((json.error as Error).message)
          onError?.(error)

          return
        }

        if (messages.length > 0) {
          conversation.push(...messages)
        }

        if (json.type === 'chain-complete') {
          uuid = json.uuid!
          chainResponse = json.response!
        }
      }

      onEvent?.({ event: event.event as StreamEventTypes, data: json })
    }

    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunks = new TextDecoder('utf-8').decode(value).trim()
      for (const chunk of chunks.split('\n\n')) {
        const event = this.parseEvent(chunk)
        if (!event) {
          onError?.(new Error(`Invalid SSE event: ${chunk}`))
          return
        }
        const data = this.parseData(chunk)
        if (data === null || data === undefined) {
          onError?.(new Error(`Invalid data in server event:\n${chunk}`))
          return
        }

        consumeEvent({ event, data })
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

  private parseEvent(chunk: string) {
    const event = chunk.split('\n')[0]
    return event?.split('event: ')[1]
  }

  private parseData(chunk: string) {
    const data = chunk.split('\n')[1]
    return data?.split('data: ')[1]
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
