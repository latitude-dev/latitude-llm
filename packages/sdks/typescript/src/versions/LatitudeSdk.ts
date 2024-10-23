import { Readable } from 'stream'

import type { Config, Message } from '@latitude-data/compiler'
import type {
  ChainEventDto,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { RouteResolver } from '$sdk/utils'
import { handleStream } from '$sdk/utils/handleStream'
import {
  BodyParams,
  HandlerType,
  LogSources,
  StreamResponseCallbacks,
  UrlParams,
} from '$sdk/utils/types'
import { LatitudeApiError } from '$sdk/utils/errors'
import nodeFetch, { Response } from 'node-fetch'

const MAX_RETRIES = 2
const WAIT_IN_MS_BEFORE_RETRY = 1000
export class LatitudeSdk {
  private versionUuid?: string
  private projectId?: number
  private apiKey: string
  private routeResolver: RouteResolver
  private source: LogSources

  constructor({
    apiKey,
    projectId,
    versionUuid,
    source,
    routeResolver,
  }: {
    apiKey: string
    versionUuid?: string
    projectId?: number
    source: LogSources
    routeResolver: RouteResolver
  }) {
    this.projectId = projectId
    this.versionUuid = versionUuid
    this.apiKey = apiKey
    this.source = source
    this.routeResolver = routeResolver
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

  async run(
    path: string,
    {
      projectId,
      versionUuid,
      parameters,
      customIdentifier,
      stream,
      onEvent,
      onFinished,
      onError,
    }: {
      projectId?: number
      versionUuid?: string
      customIdentifier?: string
      parameters?: Record<string, unknown>
      stream?: boolean
    } & StreamResponseCallbacks = {},
  ) {
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
          path,
          stream,
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

  private async request<H extends HandlerType>({
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
      this.routeResolver.resolve({ handler, params }),
      {
        method,
        headers: this.authHeader,
        body:
          method === 'POST'
            ? this.bodyToString({
              ...body,
              __internal: { source: this.source },
            })
            : undefined,
      },
    )

    if (!response.ok && response.status > 500 && retries < MAX_RETRIES) {
      await new Promise((resolve) =>
        setTimeout(resolve, WAIT_IN_MS_BEFORE_RETRY),
      )

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
