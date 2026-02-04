// TODO: Right now it takes a lot of work to add a simple new route to this file
// We should refactor this to make it easier to add new routes

export type HandlerConfig<U, B> = {
  UrlParams: U
  BodyParams: B
}

import { RouteResolver } from '$sdk/utils'
import { LatitudeApiError } from '$sdk/utils/errors'
import {
  AssertedStreamType,
  ChainCallResponseDto,
  ChainEventDto,
  ChatSyncAPIResponse,
  ParameterType,
  Providers,
  RunSyncAPIResponse,
  LogSources,
  StreamEventTypes,
} from '@latitude-data/constants'
import type {
  ChainEvent,
  ChainEventTypes,
} from '@latitude-data/constants/events'
import type {
  Config,
  Message,
  ToolCall,
} from '@latitude-data/constants/messages'
import {
  AdapterMessageType,
  ProviderAdapter,
  type Message as PromptlMessage,
} from 'promptl-ai'

export { LogSources } from '@latitude-data/constants'

export type GetAllDocumentsParams = {
  projectId: number
  versionUuid?: string
}
export type GetDocumentUrlParams = GetAllDocumentsParams & {
  path: string
}

export type GetOrCreateDocumentUrlParams = {
  projectId: number
  versionUuid?: string
}

export type RunDocumentUrlParams = {
  projectId: number
  versionUuid?: string
}

export type ChatUrlParams = {
  conversationUuid: string
}

export type StopRunUrlParams = {
  conversationUuid: string
}

export type AttachRunUrlParams = {
  conversationUuid: string
}

export type AnnotateUrlParams = {
  conversationUuid: string
  evaluationUuid: string
}

export type AnnotateBodyParams = {
  score: number
  metadata?: { reason: string }
  versionUuid?: string
}

// Project related types
export type Project = {
  id: number
  name: string
  workspaceId: number
  createdAt: string
  updatedAt: string
  lastEditedAt?: string
  deletedAt: string | null
}

export type Commit = {
  id: number
  uuid: string
  title: string
  description: string
  projectId: number
  version: number
  userId: string
  mergedAt: string
  deletedAt: string | null
  mainDocumentUuid: string | null
}

export type Version = {
  createdAt: string
  updatedAt: string
  id: number
  uuid: string
  title: string
  description: string | null
  projectId: number
  version: number | null
  userId: string
  mergedAt: string | null
  deletedAt: string | null
}

export type CreateProjectBodyParams = {
  name: string
}

export type CreateVersionUrlParams = {
  projectId: number
}

export type CreateVersionBodyParams = {
  name: string
}

export type GetversionUrlParams = {
  projectId: number
  versionUuid: string
}

export type GetAllVersionsUrlParams = {
  projectId: number
}

export type PushVersionUrlParams = {
  projectId: number
  commitUuid: string
}

export type PushVersionBodyParams = {
  changes: Array<{
    path: string
    content: string
    status: 'added' | 'modified' | 'deleted' | 'unchanged'
    contentHash?: string
  }>
}

export type LogBodyParams = {
  path: string
  messages: Message[]
  response?: string
}

export type ToolResultsBodyParams = {
  toolCallId: string
  result: unknown
  isError?: boolean
}

export enum HandlerType {
  Annotate = 'annotate',
  Chat = 'chat',
  CreateDocument = 'create-document',
  CreateProject = 'create-project',
  CreateVersion = 'create-version',
  GetAllDocuments = 'get-all-documents',
  GetAllProjects = 'get-all-projects',
  GetDocument = 'get-document',
  GetOrCreateDocument = 'get-or-create-document',
  GetVersion = 'get-version',
  GetAllVersions = 'get-all-versions',
  PushVersion = 'push-version',
  RunDocument = 'run-document',
  Log = 'log',
  ToolResults = 'tool-results',
  StopRun = 'stop-run',
  AttachRun = 'attach-run',
}

export type HandlerConfigs = {
  [HandlerType.Annotate]: HandlerConfig<AnnotateUrlParams, AnnotateBodyParams>
  [HandlerType.Chat]: HandlerConfig<ChatUrlParams, ChatBodyParams>
  [HandlerType.CreateDocument]: HandlerConfig<
    GetOrCreateDocumentUrlParams,
    GetOrCreateDocumentBodyParams
  >
  [HandlerType.CreateProject]: HandlerConfig<never, CreateProjectBodyParams>
  [HandlerType.CreateVersion]: HandlerConfig<
    CreateVersionUrlParams,
    CreateVersionBodyParams
  >
  [HandlerType.GetAllDocuments]: HandlerConfig<GetAllDocumentsParams, never>
  [HandlerType.GetAllProjects]: HandlerConfig<never, never>
  [HandlerType.GetDocument]: HandlerConfig<GetDocumentUrlParams, never>
  [HandlerType.GetOrCreateDocument]: HandlerConfig<
    GetOrCreateDocumentUrlParams,
    GetOrCreateDocumentBodyParams
  >
  [HandlerType.GetVersion]: HandlerConfig<GetversionUrlParams, never>
  [HandlerType.GetAllVersions]: HandlerConfig<GetAllVersionsUrlParams, never>
  [HandlerType.PushVersion]: HandlerConfig<
    PushVersionUrlParams,
    PushVersionBodyParams
  >
  [HandlerType.RunDocument]: HandlerConfig<
    RunDocumentUrlParams,
    RunDocumentBodyParams
  >
  [HandlerType.Log]: HandlerConfig<RunDocumentUrlParams, LogBodyParams>
  [HandlerType.ToolResults]: HandlerConfig<never, ToolResultsBodyParams>
  [HandlerType.StopRun]: HandlerConfig<StopRunUrlParams, never>
  [HandlerType.AttachRun]: HandlerConfig<
    AttachRunUrlParams,
    AttachRunBodyParams
  >
}

export type UrlParams<H extends HandlerType> = HandlerConfigs[H]['UrlParams']
export type BodyParams<H extends HandlerType> = HandlerConfigs[H]['BodyParams']

export type GenerationJob = {
  uuid: string
}

export type GenerationResponse<S extends AssertedStreamType = 'text'> = {
  uuid: string
  conversation: Message[]
  response: ChainCallResponseDto<S>
}

export type StreamResponseCallbacks<S extends AssertedStreamType = 'text'> = {
  onEvent?: ({
    event,
    data,
  }: {
    event: StreamEventTypes
    data: ChainEventDto
  }) => void
  onFinished?: (data: GenerationResponse<S>) => void
  onError?: (error: LatitudeApiError) => void
}

export type RenderToolCallDetails = {
  id: string
  name: string
}

export type ToolSpec = Record<string, Record<string, unknown>>
export type ToolHandler<T extends ToolSpec, K extends keyof T> = (
  toolCall: T[K],
  details: ToolCall,
) => Promise<unknown>
export type ToolCalledFn<Tools extends ToolSpec> = {
  [K in keyof Tools]: ToolHandler<Tools, K>
}

export type RenderToolHandler<T extends ToolSpec, K extends keyof T> = (
  toolCall: T[K],
  details: RenderToolCallDetails,
) => Promise<string | Omit<PromptlMessage, 'role'> | PromptlMessage[]>
export type RenderToolCalledFn<Tools extends ToolSpec> = {
  [K in keyof Tools]: RenderToolHandler<Tools, K>
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

export type RunPromptOptions<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
  Background extends boolean = false,
> = StreamResponseCallbacks<S> & {
  projectId?: number
  versionUuid?: string
  customIdentifier?: string
  parameters?: Record<string, unknown>
  stream?: boolean
  tools?: ToolCalledFn<Tools>
  signal?: AbortSignal
  /**
   * @deprecated Use the `messages` parameter instead. This parameter will be removed in a future version.
   */
  userMessage?: string
  mcpHeaders?: Record<string, Record<string, string>>
} & (Background extends true
    ? { background: Background }
    : { background?: Background })

export type RunPromptResult<
  S extends AssertedStreamType = 'text',
  Background extends boolean = false,
> = Background extends true ? GenerationJob : GenerationResponse<S>

export type RenderPromptOptions<M extends AdapterMessageType = PromptlMessage> =
  {
    prompt: {
      content: string
    }
    parameters: Record<string, unknown>
    adapter?: ProviderAdapter<M>
  }

export type RenderChainOptions<
  M extends AdapterMessageType = PromptlMessage,
  Tool extends ToolSpec = ToolSpec,
> = {
  prompt: Prompt
  parameters: Record<string, unknown>
  adapter?: ProviderAdapter<M>
  onStep: (args: {
    config: Config
    messages: M[]
  }) => Promise<string | Omit<M, 'role'>>
  tools?: RenderToolCalledFn<Tool>
  logResponses?: boolean
}

export type ChatOptions<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
> = StreamResponseCallbacks<S> & {
  messages: Message[]
  stream?: boolean
  tools?: ToolCalledFn<Tools>
  signal?: AbortSignal
  mcpHeaders?: Record<string, Record<string, string>>
}

export type AttachRunOptions<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
> = StreamResponseCallbacks<S> & {
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

export type ChatOptionsWithSDKOptions<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
> = ChatOptions<Tools, S> & {
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
  versionUuid: string
  uuid: string
  path: string
  content: string
  contentHash?: string
  config: Config
  parameters: Record<string, { type: ParameterType }>
  provider?: Providers
}

type GetOrCreateDocumentBodyParams = {
  path: string
  prompt?: string
}

type RunDocumentBodyParams = {
  path: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  stream?: boolean
  background?: boolean
  tools?: string[]
  /**
   * @deprecated Use the `messages` parameter instead. This parameter will be removed in a future version.
   */
  userMessage?: string
  mcpHeaders?: Record<string, Record<string, string>>
}

type ChatBodyParams = {
  messages: Message[]
  stream?: boolean
  tools?: string[]
  mcpHeaders?: Record<string, Record<string, string>>
}

type AttachRunBodyParams = {
  stream?: boolean
}
