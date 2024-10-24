import { Readable } from 'stream'

import type { Config, Message } from '@latitude-data/compiler'
import type {
  ChainEventDto,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { RouteResolver } from '$sdk/utils'
import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import {
  BodyParams,
  HandlerType,
  LogSources,
  StreamResponseCallbacks,
  UrlParams,
} from '$sdk/utils/types'
import nodeFetch, { Response } from 'node-fetch'

const MAX_RETRIES = 2
export type BaseRunOptions = StreamResponseCallbacks & {
  projectId?: number
  versionUuid?: string
  customIdentifier?: string
  parameters?: Record<string, unknown>
}
type BaseChatOptions = StreamResponseCallbacks
type SDKOptions = {
  retryMs: number
  source: LogSources
  routeResolver: RouteResolver
}

export class LatitudeSdk {
  protected projectId?: number
  protected versionUuid?: string
  protected apiKey: string
  protected options: SDKOptions

  constructor({
    apiKey,
    projectId,
    versionUuid,
    options,
  }: {
    apiKey: string
    versionUuid?: string
    projectId?: number
    options: SDKOptions
  }) {
    this.projectId = projectId
    this.versionUuid = versionUuid
    this.apiKey = apiKey
    this.options = options
  }
  async get(
    path: string,
    {
      projectId,
      versionUuid,
    }: {
      projectId?: number
      versionUuid?: string
    } = {},
  ) {
    projectId = projectId ?? this.projectId
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const response = await this.request({
      method: 'GET',
      handler: HandlerType.GetDocument,
      params: { projectId, versionUuid, path },
    })

    if (!response.ok) {
      throw new LatitudeApiError({
        status: response.status,
        statusText: response.statusText,
        serverResponse: await response.text(),
      })
    }

    return (await response.json()) as DocumentVersion & { config: Config }
  }

  async run(path: string, options: BaseRunOptions = {}) {
    return this.streamRun(path, options)
  }

  async chat(uuid: string, messages: Message[], options: BaseChatOptions = {}) {
    return this.streamChat(uuid, messages, options)
  }

  protected async streamChat(
    uuid: string,
    messages: Message[],
    { onEvent, onFinished, onError }: BaseChatOptions = {},
  ) {
    const response = await this.request({
      method: 'POST',
      handler: HandlerType.Chat,
      params: { conversationUuid: uuid },
      body: { messages },
    })

    if (!response.ok) {
      onError?.(new Error(response.statusText))
      return
    }

    return handleStream({
      body: response.body! as Readable,
      onEvent,
      onFinished,
      onError,
    })
  }

  protected async streamRun(
    path: string,
    {
      projectId,
      versionUuid,
      parameters,
      stream,
      customIdentifier,
      onEvent,
      onFinished,
      onError,
    }: BaseRunOptions & { stream?: boolean },
  ) {
    console.log('this.projectId', this.projectId)
    console.log('projectId', projectId)

    projectId = projectId ?? this.projectId

    if (!projectId) {
      onError?.(new Error('Project ID is required'))
      return
    }

    versionUuid = versionUuid ?? this.versionUuid

    try {
      const response = await this.request({
        method: 'POST',
        handler: HandlerType.RunDocument,
        params: { projectId, versionUuid },
        body: {
          stream,
          path,
          parameters,
          customIdentifier,
        },
      })

      if (!response.ok) {
        onError?.(new Error(response.statusText))
        return
      }

      return handleStream({
        body: response.body! as Readable,
        onEvent,
        onFinished,
        onError,
      })
    } catch (err) {
      onError?.(err as Error)
      return
    }
  }

  protected async request<H extends HandlerType>({
    method,
    handler,
    params,
    body,
    retries = 0,
  }: {
    handler: H
    params?: UrlParams<H>
    method: 'POST' | 'GET' | 'PUT' | 'DELETE'
    body?: BodyParams<H>
    retries?: number
  }): Promise<Response> {
    const response = await nodeFetch(
      this.options.routeResolver.resolve({ handler, params }),
      {
        method,
        headers: this.authHeader,
        body:
          method === 'POST'
            ? this.bodyToString({
                ...body,
                __internal: { source: this.options.source },
              })
            : undefined,
      },
    )

    if (!response.ok && response.status > 500 && retries < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, this.options.retryMs))

      return this.request({
        handler,
        params,
        method,
        body,
        retries: retries + 1,
      })
    }

    return response
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
