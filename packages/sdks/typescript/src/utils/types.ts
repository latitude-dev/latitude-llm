// TODO: Right now it takes a lot of work to add a simple new route to this file
// We should refactor this to make it easier to add new routes

import type { Config, Message } from '@latitude-data/compiler'
import {
  AdapterMessageType,
  ProviderAdapter,
  type Message as PromptlMessage,
} from 'promptl-ai'
import { RouteResolver } from '$sdk/utils'
import { LatitudeApiError } from '$sdk/utils/errors'
import {
  ChatSyncAPIResponse,
  RunSyncAPIResponse,
  ChainEvent,
  ChainEventTypes,
  ChainEventDto,
  StreamEventTypes,
  ChainCallResponseDto,
  Providers,
} from '@latitude-data/constants'

export type GetDocumentUrlParams = {
  projectId: number
  versionUuid?: string
  path: string
}

export type GetOrCreateDocumentUrlParams = {
  projectId: number
  versionUuid?: string
}

type GetOrCreateDocumentBodyParams = {
  path: string
  prompt?: string
}

export type RunDocumentUrlParams = {
  projectId: number
  versionUuid?: string
}

type RunDocumentBodyParams = {
  path: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  stream?: boolean
}

export type ChatUrlParams = {
  conversationUuid: string
}

type ChatBodyParams = {
  messages: Message[]
  stream?: boolean
}

export type EvaluationResultUrlParams = {
  evaluationUuid: string
}

export type LogUrlParams = RunDocumentUrlParams

type LogBodyParams = {
  path: string
  messages: Message[]
  response?: string
}

export enum HandlerType {
  GetDocument = 'get-document',
  GetOrCreateDocument = 'get-or-create-document',
  RunDocument = 'run-document',
  Chat = 'chat',
  Log = 'log',
  Evaluate = 'evaluate',
  EvaluationResult = 'evaluationResult',
}

export type UrlParams<T extends HandlerType> = T extends HandlerType.GetDocument
  ? GetDocumentUrlParams
  : T extends HandlerType.GetOrCreateDocument
    ? GetOrCreateDocumentUrlParams
    : T extends HandlerType.RunDocument
      ? RunDocumentUrlParams
      : T extends HandlerType.Chat
        ? ChatUrlParams
        : T extends HandlerType.Log
          ? LogUrlParams
          : T extends HandlerType.Evaluate
            ? { conversationUuid: string }
            : T extends HandlerType.EvaluationResult
              ? { conversationUuid: string; evaluationUuid: string }
              : never

export type BodyParams<T extends HandlerType> =
  T extends HandlerType.GetOrCreateDocument
    ? GetOrCreateDocumentBodyParams
    : T extends HandlerType.RunDocument
      ? RunDocumentBodyParams
      : T extends HandlerType.Chat
        ? ChatBodyParams
        : T extends HandlerType.Log
          ? LogBodyParams
          : T extends HandlerType.Evaluate
            ? { evaluationUuids?: string[] }
            : T extends HandlerType.EvaluationResult
              ? {
                  result: string | boolean | number
                  reason: string
                }
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
  ChainEventTypes,
  ChatSyncAPIResponse,
  RunSyncAPIResponse,
  StreamEventTypes,
}

export type GetPromptOptions = {
  projectId?: number
  versionUuid?: string
}

export type GetOrCreatePromptOptions = {
  projectId?: number
  versionUuid?: string
  prompt?: string
}

export type RunPromptOptions = StreamResponseCallbacks & {
  projectId?: number
  versionUuid?: string
  customIdentifier?: string
  parameters?: Record<string, unknown>
  stream?: boolean
}

export type RenderPromptOptions<M extends AdapterMessageType = PromptlMessage> =
  {
    prompt: {
      content: string
    }
    parameters: Record<string, unknown>
    adapter?: ProviderAdapter<M>
  }

export type RenderChainOptions<M extends AdapterMessageType = PromptlMessage> =
  {
    prompt: Prompt
    parameters: Record<string, unknown>
    adapter?: ProviderAdapter<M>
    onStep: (args: {
      config: Config
      messages: M[]
    }) => Promise<string | Omit<M, 'role'>>
    logResponses?: boolean
  }

export type ChatOptions = StreamResponseCallbacks & {
  messages: Message[]
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

export interface EvalOptions {
  evaluationUuids?: string[]
}

export type EvalPromptOptions = {
  projectId?: number
  versionUuid?: string
}

export type Prompt = {
  uuid: string
  path: string
  content: string
  config: Config
  provider?: Providers
}
