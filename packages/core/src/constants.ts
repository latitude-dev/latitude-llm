import {
  EvaluationV2,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
  LatitudeTool,
  LatitudeToolInternalName,
  LogSources,
  Otlp,
  Quota,
} from '@latitude-data/constants'
import type {
  AssistantMessage,
  Message as CompilerMessage,
  SystemMessage,
  ToolCall,
  UserMessage,
} from '@latitude-data/constants/legacyCompiler'
import { TelemetryContext } from '@latitude-data/telemetry'
import type { Component, App as PipedreamApp } from '@pipedream/sdk'
import {
  ConfigurableProp,
  ConfigurePropResponse,
  PropOption,
} from '@pipedream/sdk'
import { FinishReason, Tool, ToolResultPart } from 'ai'
import { z } from 'zod'
import { PromisedResult } from './lib/Transaction'
import { LatitudeError } from './lib/errors'
import { type ApiKey } from './schema/models/types/ApiKey'
import { type Commit } from './schema/models/types/Commit'
import { type DocumentVersion } from './schema/models/types/DocumentVersion'
import { type ProviderLog } from './schema/models/types/ProviderLog'
import { type Workspace } from './schema/models/types/Workspace'

export {
  DocumentType,
  EMAIL_REGEX,
  EMPTY_USAGE,
  FINISH_REASON_DETAILS,
  HEAD_COMMIT,
  isLatitudeUrl,
  isSafeUrl,
  languageModelUsageSchema,
  LegacyChainEventTypes,
  LogSources,
  ModifiedDocumentType,
  StreamEventTypes,
  type DocumentLog,
  type DocumentLogWithMetadata,
  type DocumentLogWithMetadataAndError,
  type LegacyVercelSDKVersion4Usage as LanguageModelUsage,
  type LegacyChainEvent,
} from '@latitude-data/constants'
export * from '@latitude-data/constants/actions'
export * from '@latitude-data/constants/evaluations'
export * from '@latitude-data/constants/grants'
export * from '@latitude-data/constants/issues'
export * from '@latitude-data/constants/latte'
export * from '@latitude-data/constants/optimizations'
export * from '@latitude-data/constants/runs'
export * from '@latitude-data/constants/tracing'

export const LATITUDE_EVENT = 'latitudeEventsChannel'
export const LATITUDE_DOCS_URL = 'https://docs.latitude.so'
export const LATITUDE_EMAIL = 'hello@latitude.so'
export const LATITUDE_SLACK_URL =
  'https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw'
export const DEFAULT_PROVIDER_MAX_FREE_RUNS = 100

export enum CommitStatus {
  All = 'all',
  Merged = 'merged',
  Draft = 'draft',
}

export type Message = CompilerMessage

export const HELP_CENTER = {
  commitVersions: `${LATITUDE_DOCS_URL}/not-found`,
}

export type StreamType = 'object' | 'text'
type BaseResponse = {
  text: string
  usage: LanguageModelUsage
  finishReason?: FinishReason
  chainCompleted?: boolean
  documentLogUuid?: string
  providerLog?: ProviderLog
  // TODO(promptl): move this message type to promptl and call it ToolResultMessage
  output?: (AssistantMessage | { role: 'tool'; content: ToolResultPart[] })[]
}

export type ChainStepTextResponse = BaseResponse & {
  streamType: 'text'
  reasoning: string | undefined
  toolCalls: ToolCall[]
}

export type ChainStepObjectResponse = BaseResponse & {
  streamType: 'object'
  object: any
}

export type ChainStepResponse<T extends StreamType = StreamType> =
  T extends 'text'
    ? ChainStepTextResponse
    : T extends 'object'
      ? ChainStepObjectResponse
      : never

export const LOG_SOURCES = Object.values(LogSources)

export enum ErrorableEntity {
  DocumentLog = 'document_log',
  EvaluationResult = 'evaluation_result',
}

export enum RewardType {
  XFollow = 'x_follow',
  LinkedInFollow = 'linkedin_follow',
  GithubStar = 'github_star',
  XPost = 'x_post',
  LinkedInPost = 'linkedin_post',
  AgentShare = 'agent_share',
  ProductHuntUpvote = 'producthunt_upvote',
  Referral = 'referral',
}

export const REWARD_VALUES: Record<RewardType, number> = {
  [RewardType.XFollow]: 2_000,
  [RewardType.LinkedInFollow]: 2_000,
  [RewardType.GithubStar]: 1_000,
  [RewardType.XPost]: 5_000,
  [RewardType.LinkedInPost]: 5_000,
  [RewardType.AgentShare]: 10_000,
  [RewardType.Referral]: 10_000,
  // Deprecated
  [RewardType.ProductHuntUpvote]: 0,
}

export type EvaluationAggregationTotals = {
  tokens: number
  costInMillicents: number
  totalCount: number
}
export type EvaluationModalValue = {
  mostCommon: string
  percentage: number
}

export type EvaluationMeanValue = {
  minValue: number
  maxValue: number
  meanValue: number
}

export type WorkspaceUsage = {
  usage: number
  max: Quota
  members: number
  maxMembers: Quota
}

export type ChainCallResponseDto =
  | Omit<ChainStepResponse<'object'>, 'documentLogUuid' | 'providerLog'>
  | Omit<ChainStepResponse<'text'>, 'documentLogUuid' | 'providerLog'>

export type SerializedConversation = {
  all: Message[]
  first: Message | null
  last: Message | null
  user: {
    all: UserMessage[]
    first: UserMessage | null
    last: UserMessage | null
  }
  system: {
    all: SystemMessage[]
    first: SystemMessage | null
    last: SystemMessage | null
  }
  assistant: {
    all: AssistantMessage[]
    first: AssistantMessage | null
    last: AssistantMessage | null
  }
}

export type SerializedProviderLog = {
  messages: SerializedConversation
  context: string
  toolCalls: ToolCall[] | null
  response: string | null
  config: object | null
  cost: number
  tokens: number
  duration: number
}

export type SerializedDocumentLog = SerializedProviderLog & {
  prompt: string
  parameters: Record<string, unknown>
}

export type EvaluatedDocumentLog = SerializedDocumentLog & {
  uuid: string
  createdAt: Date
  actualOutput: string
  conversation: string
}

export const SERIALIZED_DOCUMENT_LOG_FIELDS = [
  'messages',
  'context',
  'response',
  'config',
  'duration',
  'tokens',
  'cost',
  'prompt',
  'parameters',
  'toolCalls',
]

export const ULTRA_LARGE_PAGE_SIZE = 1000
export const DELIMITER_VALUES = {
  comma: ',',
  semicolon: ';',
  tab: '\t',
  space: ' ',
}
export const DELIMITERS_KEYS = [
  'comma',
  'semicolon',
  'tab',
  'space',
  'custom',
] as const
export const MAX_SIZE = 25
export const MAX_UPLOAD_SIZE_IN_MB = MAX_SIZE * 1024 * 1024

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
})

const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const imageContentSchema = z.object({
  type: z.literal('image'),
  image: z
    .string()
    .or(z.instanceof(Uint8Array))
    .or(z.instanceof(ArrayBuffer))
    .or(z.instanceof(URL)),
  mimeType: z.string().optional(),
})

const fileContentSchema = z.object({
  type: z.literal('file'),
  file: z
    .string()
    .or(z.instanceof(Uint8Array))
    .or(z.instanceof(ArrayBuffer))
    .or(z.instanceof(URL)),
  mimeType: z.string(),
})

const toolCallContentSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
})

const toolResultContentSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown(),
  isError: z.boolean().optional(),
})

export const messageSchema = z
  .object({
    role: z.literal('system'),
    content: z.string().or(z.array(textContentSchema)),
  })
  .or(
    z.object({
      role: z.literal('user'),
      content: z
        .string()
        .or(
          z.array(
            textContentSchema.or(imageContentSchema).or(fileContentSchema),
          ),
        ),
      name: z.string().optional(),
    }),
  )
  .or(
    z.object({
      role: z.literal('assistant'),
      content: z
        .string()
        .or(z.array(textContentSchema.or(toolCallContentSchema))),
      toolCalls: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            arguments: z.record(z.string(), z.unknown()),
          }),
        )
        .optional(),
    }),
  )
  .or(
    z.object({
      role: z.literal('tool'),
      content: z.array(toolResultContentSchema),
    }),
  )

export const messagesSchema = z.array(messageSchema)

export const DEFAULT_PAGINATION_SIZE = 25

export type DateRange = { from?: Date; to?: Date }
export type SureDateRange = { from: Date; to: Date }

// TODO: Review if it's used
export type CsvData = {
  headers: string[]
  data: {
    record: Record<string, string>
    info: { columns: { name: string }[] }
  }[]
}

export type {
  AppliedRules,
  ProviderRules,
} from './services/ai/providers/rules/types'

export type SearchFilter = {
  field: string
  operator: string
  value: string
}

export type DocumentVersionDto = DocumentVersion & {
  projectId: number
  commitUuid: string
}

export const documentLogFilterOptionsSchema = z.object({
  commitIds: z.array(z.number()),
  logSources: z.array(z.enum(LogSources)),
  createdAt: z
    .object({ from: z.date().optional(), to: z.date().optional() })
    .optional(),
  customIdentifier: z.string().optional(),
  experimentId: z.number().optional(),
})
export type DocumentLogFilterOptions = z.infer<
  typeof documentLogFilterOptionsSchema
>

export const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

export type DiffValue = {
  newValue?: string
  oldValue?: string
}

export type DraftChange = {
  newDocumentPath: string
  oldDocumentPath: string
  content: DiffValue
}

const CLOUD_INFO_URL =
  'https://docs.latitude.so/guides/getting-started/quick-start#latitude-cloud'
const CLOUD_INFO = `More info: ${CLOUD_INFO_URL}`
export const CLOUD_MESSAGES = {
  generateDatasets: `Dataset generator is only available on Latitude Cloud. ${CLOUD_INFO}`,
  generateEvaluationIssueUsingCopilot: `Evaluation issue generator is only available on Latitude Cloud. ${CLOUD_INFO}`,
  generateEvaluations: `Evaluation generator is only available on Latitude Cloud. ${CLOUD_INFO}`,
  refinePrompt: `Prompt refiner is only available on Latitude Cloud. ${CLOUD_INFO}`,
  promptSuggestions: `Prompt suggestions are only available on Latitude Cloud. ${CLOUD_INFO}`,
  documentSuggestions: `Document suggestions are only available on Latitude Cloud. ${CLOUD_INFO}`,
  generateAgentDetails: `Agent details generator is only available on Latitude Cloud. ${CLOUD_INFO}`,
  issueDiscovery: `Issue discovery is only available on Latitude Cloud. ${CLOUD_INFO}`,
  promptOptimization: `Prompt optimization is only available on Latitude Cloud. ${CLOUD_INFO}`,
}

export const LATITUDE_TOOLS_CONFIG_NAME = 'latitudeTools'

export const DOCUMENT_SUGGESTION_EXPIRATION_DAYS = 7
export const MAX_DOCUMENT_SUGGESTIONS_PER_EVALUATION = 1
export const MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION = 5
export const EVALUATION_RESULT_RECENCY_DAYS = 7
export const DOCUMENT_SUGGESTION_NOTIFICATION_DAYS = 1

export type DocumentRunPromptSource = {
  document: DocumentVersion
  commit: Commit
}
export type PromptSource = EvaluationV2 | DocumentRunPromptSource

export type LatitudeToolDefinition = {
  name: LatitudeTool
  internalName: LatitudeToolInternalName
  definition: (context?: TelemetryContext) => Tool
  method: (args: unknown) => PromisedResult<unknown, LatitudeError>
}

export type LatitudeToolCall = ToolCall & {
  name: LatitudeToolInternalName
}

export const DATASET_COLUMN_ROLES = {
  parameter: 'parameter',
  label: 'label',
  metadata: 'metadata',
} as const

export type DatasetColumnRole =
  (typeof DATASET_COLUMN_ROLES)[keyof typeof DATASET_COLUMN_ROLES]

export type ProviderApiKeyUsage = {
  projectId: number
  projectName: string
  commitUuid: string
  documentUuid: string
  documentPath: string
  evaluationUuid?: string
  evaluationName?: string
}[]

export const LIMITED_VIEW_THRESHOLD = 120_000 // Approximated logs
export const STATS_CACHING_THRESHOLD = 5_000 // Actual logs
export const PROJECT_STATS_CACHE_KEY = (
  workspaceId: number,
  projectId: number,
) => `project_stats:${workspaceId}:${projectId}`
export const STATS_CACHE_TTL = 2 * 24 * 60 * 60 // 2 days

export const LAST_LATTE_THREAD_CACHE_KEY = (
  workspaceId: number,
  userId: string,
  projectId: number,
) => `latte:last_thread:${workspaceId}:${userId}:${projectId}`

export enum PipedreamComponentType {
  Tool = 'action',
  Trigger = 'source',
}

export type PipedreamComponent<T extends PipedreamComponentType = any> = Omit<
  Component,
  'componentType'
> & {
  componentType: T
}

// Pipedream's App type does not include the `connect` property
// but is present at runtime
export type ExtendedPipedreamApp = PipedreamApp & {
  connect: unknown
}
export type App = Omit<ExtendedPipedreamApp, 'customFieldsJson' | 'connect'>

export type AppDto = App & {
  tools: PipedreamComponent<PipedreamComponentType.Tool>[]
  triggers: PipedreamComponent<PipedreamComponentType.Trigger>[]
}

// Light version of AppDto without configurableProps for reduced payload
export type LightPipedreamComponent<T extends PipedreamComponentType> = Omit<
  PipedreamComponent<T>,
  'configurableProps'
>

export type LightAppDto = App & {
  tools: LightPipedreamComponent<PipedreamComponentType.Tool>[]
  triggers: LightPipedreamComponent<PipedreamComponentType.Trigger>[]
}

export type SpanBulkProcessingData = {
  spans: Array<{
    span: Otlp.ResourceSpan
    scope: Otlp.Scope
    resource: Otlp.Resource
    apiKey: ApiKey
    workspace: Workspace
  }>
}

export type ConfigurablePropWithRemoteOptions = ConfigurableProp & {
  remoteOptionValues?: RemoteOptions
}

export class RemoteOptions {
  public remoteOptions: PropOption[] | string[]
  constructor(remoteOptions: ConfigurePropResponse) {
    if (remoteOptions.options) {
      // If they're nested objects
      const propOptions = remoteOptions.options.map((option) => {
        // For some reason, Pipedream MAY have a "nested" option object, where the values are nested inside an "lv" property
        if ('lv' in option) return option.lv
        return option
      })
      this.remoteOptions = propOptions
      return
    }

    if (remoteOptions.stringOptions) {
      this.remoteOptions = remoteOptions.stringOptions
      return
    }

    this.remoteOptions = []
  }

  getFlattenedValues(): string[] {
    return this.remoteOptions.map((option) => {
      if (typeof option === 'string') {
        return option
      }

      return option.value as string
    })
  }

  containsAll(lattesChoices: string[] | string): boolean {
    const lattesChoicesArray = Array.isArray(lattesChoices)
      ? lattesChoices
      : [lattesChoices]
    return lattesChoicesArray.every((value) => this.includes(value))
  }

  private includes(searchValue: string): boolean {
    return this.getFlattenedValues().includes(searchValue)
  }
}

export const ONBOARDING_DOCUMENT_PATH = 'onboarding'

export const API_ROUTES = {
  integrations: {
    oauth: {
      callback: '/api/integrations/oauth/callback',
    },
  },
}
