import type { Message } from '@latitude-data/compiler'
import {
  type ChainCallResponseDto,
  type ChainEvent,
  type ChainEventDto,
  type ChainEventTypes,
  type RunSyncAPIResponse,
  type StreamEventTypes,
} from '@latitude-data/core/browser'
import { RouteResolver } from '$sdk/utils'
import { LatitudeApiError } from '$sdk/utils/errors'

export type RunUrlParams = {
  projectId: number
  versionUuid?: string
}
export type ChatUrlParams = {
  conversationUuid: string
}

type RunDocumentBodyParam = {
  path: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  stream?: boolean
}
type ChatBodyParams = {
  messages: Message[]
}

export type GetDocumentUrlParams = {
  projectId: number
  versionUuid?: string
  path: string
}

export enum HandlerType {
  Chat = 'chat',
  GetDocument = 'get-document',
  RunDocument = 'run-document',
}

export type UrlParams<T extends HandlerType> = T extends HandlerType.RunDocument
  ? RunUrlParams
  : T extends HandlerType.GetDocument
    ? GetDocumentUrlParams
    : T extends HandlerType.Chat
      ? ChatUrlParams
      : never

export type BodyParams<T extends HandlerType> =
  T extends HandlerType.RunDocument
    ? RunDocumentBodyParam
    : T extends HandlerType.Chat
      ? ChatBodyParams
      : never

export type StreamChainResponse = {
  conversation: Message[]
  response: ChainCallResponseDto
}

export type StreamResponseCallbacks = {
  onEvent?: ({
    event,
    data,
  }: {
    event: StreamEventTypes
    data: ChainEventDto
  }) => void
  onFinished?: (data: StreamChainResponse) => void
  onError?: (error: LatitudeApiError) => void
}

export enum LogSources {
  API = 'api',
  Playground = 'playground',
  Evaluation = 'evaluation',
}

export type SdkApiVersion = 'v1' | 'v2'

export type {
  ChainEvent,
  StreamEventTypes,
  ChainEventTypes,
  RunSyncAPIResponse,
}

export type RunOptions = StreamResponseCallbacks & {
  projectId?: number
  versionUuid?: string
  customIdentifier?: string
  parameters?: Record<string, unknown>
  stream?: boolean
}

export type SDKOptions = {
  apiKey: string
  retryMs: number
  source: LogSources
  routeResolver: RouteResolver
  versionUuid?: string
  projectId?: number
}
