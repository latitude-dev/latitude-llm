import type {
  AssistantMessage,
  Message as CompilerMessage,
  SystemMessage,
  ToolCall,
  UserMessage,
} from '@latitude-data/compiler'
import {
  EvaluationResultableType,
  LatitudeTool,
  LatitudeToolInternalName,
  LogSources,
  type ToolDefinition,
} from '@latitude-data/constants'
import { FinishReason, LanguageModelUsage } from 'ai'
import { z } from 'zod'

import type {
  Commit,
  DocumentVersion,
  EvaluationV2,
  ProviderLog,
} from './browser'
import { PromisedResult } from './lib/Transaction'
import { LatitudeError } from './lib/errors'
import { App, V1Component } from '@pipedream/sdk/browser'

export {
  DocumentType,
  EvaluationResultableType,
  FinishReason,
  HEAD_COMMIT,
  LegacyChainEventTypes,
  LogSources,
  ModifiedDocumentType,
  StreamEventTypes,
  type LegacyChainEvent,
} from '@latitude-data/constants'
export * from '@latitude-data/constants/evaluations'
export * from '@latitude-data/constants/tracing'

export const LATITUDE_EVENT = 'latitudeEventsChannel'
export const LATITUDE_DOCS_URL = 'https://docs.latitude.so'
export const LATITUDE_EMAIL = 'hello@latitude.so'
export const LATITUDE_SLACK_URL =
  'https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw'
export const LATITUDE_HELP_URL = LATITUDE_SLACK_URL
export const DEFAULT_PROVIDER_MAX_FREE_RUNS = 100

export enum CommitStatus {
  All = 'all',
  Merged = 'merged',
  Draft = 'draft',
}

export {
  DEFAULT_PROVIDER_SUPPORTED_MODELS,
  PROVIDER_MODELS,
  Providers,
} from './services/ai/providers/models'

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

export enum EvaluationMetadataType {
  LlmAsJudgeAdvanced = 'llm_as_judge',
  LlmAsJudgeSimple = 'llm_as_judge_simple',
  Manual = 'manual',
}

export enum RewardType {
  GithubStar = 'github_star',
  GithubIssue = 'github_issue',
  Follow = 'follow',
  Post = 'post',
  Referral = 'referral',
  SignupLaunchDay = 'signup_launch_day',
}

export const REWARD_VALUES: Record<RewardType, number> = {
  [RewardType.GithubStar]: 1_000,
  [RewardType.Follow]: 2_000,
  [RewardType.Post]: 5_000,
  [RewardType.GithubIssue]: 10_000,
  [RewardType.Referral]: 5_000,
  [RewardType.SignupLaunchDay]: 10_000,
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
  max: number
  members: number
  maxMembers: number
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
  toolCalls: ToolCall[]
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

export type SerializedEvaluationManualResult = {
  resultableType: EvaluationResultableType
  result: string | number | boolean | undefined
  reason: string | null
  evaluatedLog: SerializedDocumentLog
}
type EvaluatedProviderLog = Omit<SerializedProviderLog, 'response'>

export type SerializedEvaluationResult = SerializedEvaluationManualResult &
  EvaluatedProviderLog

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

export const DOCUMENT_PATH_REGEXP = /^([\w-]+\/)*([\w-.])+$/

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.any()),
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
  args: z.record(z.any()),
})

const toolResultContentSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.any(),
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
            arguments: z.record(z.any()),
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

export const messagesSchema = z.array(z.any(messageSchema))

export const resultConfigurationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(EvaluationResultableType.Boolean),
    falseValueDescription: z.string().optional(),
    trueValueDescription: z.string().optional(),
  }),
  z.object({
    type: z.literal(EvaluationResultableType.Number),
    minValue: z.number(),
    maxValue: z.number(),
    minValueDescription: z.string().optional(),
    maxValueDescription: z.string().optional(),
  }),
  z.object({
    type: z.literal(EvaluationResultableType.Text),
    valueDescription: z.string().optional(),
  }),
])

export const DEFAULT_PAGINATION_SIZE = 25

export type DateRange = { from?: Date; to?: Date }

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
  logSources: z.array(z.nativeEnum(LogSources)),
  createdAt: z
    .object({ from: z.date().optional(), to: z.date().optional() })
    .optional(),
  customIdentifier: z.string().optional(),
  experimentId: z.number().optional(),
})
export type DocumentLogFilterOptions = z.infer<
  typeof documentLogFilterOptionsSchema
>

export const RELATIVE_DATES = {
  today: 'today',
  yesterday: 'yesterday',
  current_week: 'current_week',
  current_month: 'current_month',
  current_year: 'current_year',
  last_week: 'last_week',
  last_month: 'last_month',
  last_3_days: 'last_3_days',
  last_7_days: 'last_7_days',
  last_14_days: 'last_14_days',
  last_30_days: 'last_30_days',
  last_60_days: 'last_60_days',
  last_90_days: 'last_90_days',
  last_12_months: 'last_12_months',
} as const

export type RelativeDate = keyof typeof RELATIVE_DATES

export const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

export const LOG_FILTERS_ENCODED_PARAMS = ['customIdentifier']

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
  generateEvaluations: `Evaluation generator is only available on Latitude Cloud. ${CLOUD_INFO}`,
  refinePrompt: `Prompt refiner is only available on Latitude Cloud. ${CLOUD_INFO}`,
  promptSuggestions: `Prompt suggestions are only available on Latitude Cloud. ${CLOUD_INFO}`,
  documentSuggestions: `Document suggestions are only available on Latitude Cloud. ${CLOUD_INFO}`,
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
  definition: ToolDefinition
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

export const LIMITED_VIEW_THRESHOLD = 1_000_000 // Approximated logs
export const STATS_CACHING_THRESHOLD = 5_000 // Actual logs
export const DOCUMENT_STATS_CACHE_KEY = (
  workspaceId: number,
  documentUuid: string,
) => `document_stats:${workspaceId}:${documentUuid}`
export const PROJECT_STATS_CACHE_KEY = (
  workspaceId: number,
  projectId: number,
) => `project_stats:${workspaceId}:${projectId}`
export const STATS_CACHE_TTL = 2 * 24 * 60 * 60 // 2 days

export enum PipedreamComponentType {
  Tool = 'action',
  Trigger = 'source',
}

export type PipedreamComponent<T extends PipedreamComponentType> = Omit<
  V1Component,
  'component_type'
> & {
  component_type: T
}

export type AppDto = App & {
  tools: PipedreamComponent<PipedreamComponentType.Tool>[]
  triggers: PipedreamComponent<PipedreamComponentType.Trigger>[]
}
