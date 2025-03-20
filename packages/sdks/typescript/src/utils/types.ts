// TODO: Right now it takes a lot of work to add a simple new route to this file
// We should refactor this to make it easier to add new routes

import type { Config, Message, ToolCall } from '@latitude-data/compiler'
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
  LegacyChainEvent as ChainEvent,
  LegacyChainEventTypes as ChainEventTypes,
  ChainEventDto,
  StreamEventTypes,
  ChainCallResponseDto,
  Providers,
  ParameterType,
} from '@latitude-data/constants'

type ProjectAndVersion = {
  projectId: number
  versionUuid?: string
}

export type GetAllDocumentsParams = ProjectAndVersion
export type GetDocumentUrlParams = ProjectAndVersion & { path: string }
export type GetOrCreateDocumentUrlParams = ProjectAndVersion
export type RunDocumentUrlParams = ProjectAndVersion

type GetOrCreateDocumentBodyParams = { path: string; prompt?: string }
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

export type LogUrlParams = ProjectAndVersion

type LogBodyParams = {
  path: string
  messages: Message[]
  response?: string
}

export enum HandlerType {
  GetDocument = 'get-document',
  GetAllDocuments = 'get-all-documents',
  GetOrCreateDocument = 'get-or-create-document',
  RunDocument = 'run-document',
  Chat = 'chat',
  Log = 'log',
  Evaluate = 'evaluate',
  EvaluationResult = 'evaluationResult',
}

type UrlParamsMap = {
  [HandlerType.GetDocument]: GetDocumentUrlParams
  [HandlerType.GetAllDocuments]: GetAllDocumentsParams
  [HandlerType.GetOrCreateDocument]: GetOrCreateDocumentUrlParams
  [HandlerType.RunDocument]: RunDocumentUrlParams
  [HandlerType.Chat]: ChatUrlParams
  [HandlerType.Log]: LogUrlParams
  [HandlerType.Evaluate]: { conversationUuid: string }
  [HandlerType.EvaluationResult]: {
    conversationUuid: string
    evaluationUuid: string
  }
}

export type UrlParams<T extends HandlerType> = T extends keyof UrlParamsMap
  ? UrlParamsMap[T]
  : never

type BodyParamsMap = {
  [HandlerType.GetOrCreateDocument]: GetOrCreateDocumentBodyParams
  [HandlerType.RunDocument]: RunDocumentBodyParams
  [HandlerType.Chat]: ChatBodyParams
  [HandlerType.Log]: LogBodyParams
  [HandlerType.Evaluate]: { evaluationUuids?: string[] }
  [HandlerType.EvaluationResult]: {
    result: string | boolean | number
    reason: string
  }
}

export type BodyParams<T extends HandlerType> = T extends keyof BodyParamsMap
  ? BodyParamsMap[T]
  : never

export type StreamChainResponse = {
  uuid: string
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

export type ToolCallDetails = {
  toolId: string
  toolName: string
  requestedToolCalls: ToolCall[]
  conversationUuid: string
  messages: Message[]
  pauseExecution: () => void
}

export type ToolSpec = Record<string, Record<string, unknown>>
export type ToolHandler<T extends ToolSpec, K extends keyof T> = (
  toolCall: T[K],
  details: ToolCallDetails,
) => Promise<unknown>
export type ToolCalledFn<Tools extends ToolSpec> = {
  [K in keyof Tools]: ToolHandler<Tools, K>
}

export type SdkApiVersion = 'v1' | 'v2' | 'v3'

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

export type RunPromptOptions<Tools extends ToolSpec> =
  StreamResponseCallbacks & {
    projectId?: number
    versionUuid?: string
    customIdentifier?: string
    parameters?: Record<string, unknown>
    stream?: boolean
    tools?: ToolCalledFn<Tools>
    signal?: AbortSignal
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

export type ChatOptions<Tools extends ToolSpec> = StreamResponseCallbacks & {
  messages: Message[]
  stream?: boolean
  tools?: ToolCalledFn<Tools>
  signal?: AbortSignal
}

export type SDKOptions = {
  apiKey: string
  retryMs: number
  source: LogSources
  routeResolver: RouteResolver
  versionUuid?: string
  projectId?: number
  signal?: AbortSignal
}

export type ChatOptionsWithSDKOptions<Tools extends ToolSpec> =
  ChatOptions<Tools> & {
    options: SDKOptions
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
  parameters: Record<string, { type: ParameterType }>
  provider?: Providers
}
