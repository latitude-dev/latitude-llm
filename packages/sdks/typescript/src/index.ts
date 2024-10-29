import { Readable } from 'stream'

import type { Config, Message } from '@latitude-data/compiler'
import {
  DocumentVersion,
  type ChainEventDto,
} from '@latitude-data/core/browser'
import env from '$sdk/env'
import { GatewayApiConfig, RouteResolver } from '$sdk/utils'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeApiError,
} from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import { streamRun } from '$sdk/utils/streamRun'
import { syncRun } from '$sdk/utils/syncRun'
import {
  HandlerType,
  LogSources,
  RunOptions,
  SDKOptions,
  StreamChainResponse,
  StreamResponseCallbacks,
} from '$sdk/utils/types'

const WAIT_IN_MS_BEFORE_RETRY = 1000
const DEFAULT_GAWATE_WAY = {
  host: env.GATEWAY_HOSTNAME,
  port: env.GATEWAY_PORT,
  ssl: env.GATEWAY_SSL,
}
const DEFAULT_INTERNAL = {
  source: LogSources.API,
  retryMs: WAIT_IN_MS_BEFORE_RETRY,
}

type Options = {
  versionUuid?: string
  projectId?: number
  gateway?: GatewayApiConfig
  __internal?: { source?: LogSources; retryMs?: number }
}

class Latitude {
  protected options: SDKOptions

  constructor(
    apiKey: string,
    {
      projectId,
      versionUuid,
      gateway = DEFAULT_GAWATE_WAY,
      __internal,
    }: Options = {
      gateway: DEFAULT_GAWATE_WAY,
    },
  ) {
    const { source, retryMs } = { ...DEFAULT_INTERNAL, ...__internal }
    this.options = {
      apiKey,
      retryMs,
      source,
      versionUuid,
      projectId,
      routeResolver: new RouteResolver({
        gateway,
        apiVersion: 'v2',
      }),
    }
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
    projectId = projectId ?? this.options.projectId
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const response = await makeRequest({
      method: 'GET',
      handler: HandlerType.GetDocument,
      params: { projectId, versionUuid, path },
      options: this.options,
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      json.errorCode
      throw new LatitudeApiError({
        status: response.status,
        message: response.statusText,
        serverResponse: JSON.stringify(json),
        errorCode: json.errorCode,
      })
    }

    return (await response.json()) as DocumentVersion & { config: Config }
  }

  async run(path: string, args: RunOptions) {
    const options = { ...args, options: this.options }

    if (args.stream) return streamRun(path, options)

    return syncRun(path, options)
  }

  async log(
    path: string,
    messages: Message[],
    {
      response,
      projectId,
      versionUuid,
    }: {
      projectId?: number
      versionUuid?: string
      response?: string
    } = {},
  ) {
    projectId = projectId ?? this.options.projectId
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    versionUuid = versionUuid ?? this.options.versionUuid

    const httpResponse = await makeRequest({
      method: 'POST',
      handler: HandlerType.Log,
      params: { projectId, versionUuid },
      body: { path, messages, response },
      options: this.options,
    })

    if (!httpResponse.ok) {
      throw new LatitudeApiError({
        status: httpResponse.status,
        message: httpResponse.statusText,
        serverResponse: await httpResponse.text(),
        errorCode: ApiErrorCodes.HTTPException,
      })
    }

    return await httpResponse.json()
  }

  async chat(
    uuid: string,
    messages: Message[],
    { onEvent, onFinished, onError }: StreamResponseCallbacks = {},
  ) {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.Chat,
      params: { conversationUuid: uuid },
      body: { messages },
      options: this.options,
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      const error = new LatitudeApiError({
        status: response.status,
        serverResponse: JSON.stringify(json),
        message: json.message,
        errorCode: json.errorCode,
        dbErrorRef: json.dbErrorRef,
      })
      onError?.(error)
      return
    }

    return handleStream({
      body: response.body! as Readable,
      onEvent,
      onFinished,
      onError,
    })
  }
}

export { Latitude, LatitudeApiError, LogSources }
export type { ChainEventDto, Message, StreamChainResponse }
