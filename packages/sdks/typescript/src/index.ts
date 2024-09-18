import type { Message } from '@latitude-data/compiler'
import { ChainCallResponse, LogSources } from '@latitude-data/core/browser'
import env from '$sdk/env'
import { GatewayApiConfig, RouteResolver } from '$sdk/utils'
import {
  BodyParams,
  ChainEvent,
  HandlerType,
  UrlParams,
} from '$sdk/utils/types'

export type StreamChainResponse = {
  conversation: Message[]
  response: ChainCallResponse
}
type StreamResponseCallbacks = {
  onMessage?: (chainEvent: ChainEvent) => void
  onFinished?: (data: StreamChainResponse) => void
  onError?: (error: Error) => void
}

export class LatitudeSdk {
  private latitudeApiKey: string
  private routeResolver: RouteResolver

  constructor({
    latitudeApiKey,
    gateway = {
      host: env.GATEWAY_HOSTNAME,
      port: env.GATEWAY_PORT,
      ssl: env.GATEWAY_SSL,
    },
  }: {
    latitudeApiKey: string
    gateway?: GatewayApiConfig
  }) {
    this.routeResolver = new RouteResolver({
      gateway,
      apiVersion: 'v1',
    })
    this.latitudeApiKey = latitudeApiKey
  }

  async runDocument({
    params: { projectId, documentPath, commitUuid, parameters, source },
    onMessage,
    onFinished,
    onError,
  }: {
    params: {
      projectId: number
      documentPath: string
      commitUuid?: string
      parameters?: Record<string, unknown>
      source?: LogSources
    }
  } & StreamResponseCallbacks) {
    const response = await this.makeRequest({
      method: 'POST',
      handler: HandlerType.RunDocument,
      params: { projectId, commitUuid },
      body: { documentPath, parameters, source },
    })
    return this.handleStreamChainResponse({
      response,
      onMessage,
      onFinished,
      onError,
    })
  }

  async addMessages({
    params: { documentLogUuid, messages, source },
    onMessage,
    onFinished,
    onError,
  }: {
    params: {
      documentLogUuid: string
      messages: Message[]
      source?: LogSources
    }
  } & StreamResponseCallbacks) {
    const response = await this.makeRequest({
      method: 'POST',
      handler: HandlerType.AddMessageToDocumentLog,
      body: { documentLogUuid, messages, source },
    })
    return this.handleStreamChainResponse({
      response,
      onMessage,
      onFinished,
      onError,
    })
  }

  private async handleStreamChainResponse({
    response,
    onMessage,
    onFinished,
    onError,
  }: StreamResponseCallbacks & {
    response: Response
  }) {
    const body = response.body ?? new ReadableStream()
    const reader = body.getReader()

    const conversation: Message[] = []
    let chainResponse: ChainCallResponse
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      const chunks = new TextDecoder('utf-8').decode(value).trim()
      if (chunks?.startsWith('event: error')) {
        onError?.(new Error(chunks))
        break
      }

      chunks.split('\n').forEach((line) => {
        if (!line.startsWith('data:')) return

        const json = line.slice(6)
        const chunk = this.parseJSON(json, onError)
        if (!chunk) return

        // FIXME: Magic variables. I think we need to share these constants (enums)
        // in a new package. Now they are in `core` but I don't want to depend on core
        // just for this. We need these enums in production not only as a dev dependency.
        if (chunk.event === 'latitude-event') {
          const messages = 'messages' in chunk.data ? chunk.data.messages! : []
          if (messages.length > 0) {
            // At the moment all message.content should be a string
            // but in the future this could be an image or other type
            // @ts-ignore
            conversation.push(...messages)
          }

          if (chunk.data.type === 'chain-complete') {
            chainResponse = chunk.data.response
          }
        }

        onMessage?.(chunk)
      })
    }

    const finalResponse = {
      conversation,
      response: chainResponse!,
    }

    onFinished?.(finalResponse)

    return finalResponse
  }

  private async makeRequest<H extends HandlerType>({
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

  private parseJSON(line: string, onError?: (error: Error) => void) {
    let json = null
    try {
      return JSON.parse(line) as ChainEvent
    } catch (e) {
      onError?.(e as Error)
    }

    return json
  }

  private get authHeader() {
    return {
      Authorization: `Bearer ${this.latitudeApiKey}`,
      'Content-Type': 'application/json',
    }
  }

  private bodyToString(body: object = {}) {
    return JSON.stringify(body)
  }
}

export type { ChainEvent, Message }
