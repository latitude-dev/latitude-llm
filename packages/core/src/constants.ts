import {
  type AssistantMessage,
  type Message as CompilerMessage,
  type SystemMessage,
  type ToolCall,
  type UserMessage,
} from '@latitude-data/compiler'
import {
  CoreTool,
  LanguageModelUsage,
  ObjectStreamPart,
  TextStreamPart,
} from 'ai'
import { z } from 'zod'

import { ProviderLog } from './browser'
import { Config } from './services/ai'

export const LATITUDE_EVENT = 'latitudeEventsChannel'
export const LATITUDE_DOCS_URL = 'https://docs.latitude.so'
export const LATITUDE_EMAIL = 'hello@latitude.so'
export const LATITUDE_SLACK_URL =
  'https://trylatitude.slack.com/join/shared_invite/zt-17dyj4elt-rwM~h2OorAA3NtgmibhnLA#/shared-invite/email'
export const LATITUDE_HELP_URL = LATITUDE_SLACK_URL
export const HEAD_COMMIT = 'live'
export const DEFAULT_PROVIDER_MAX_FREE_RUNS = 1000

export enum CommitStatus {
  All = 'all',
  Merged = 'merged',
  Draft = 'draft',
}

export {
  DEFAULT_PROVIDER_UNSUPPORTED_MODELS,
  PROVIDER_MODELS,
  Providers,
} from './services/ai/providers/models'
export { PARAMETERS_FROM_LOG } from './services/evaluations/compiler/constants'

export type Message = CompilerMessage

export enum ModifiedDocumentType {
  Created = 'created',
  Updated = 'updated',
  Deleted = 'deleted',
}

export const HELP_CENTER = {
  commitVersions: `${LATITUDE_DOCS_URL}/not-found`,
}

export type StreamType = 'object' | 'text'
type BaseResponse = {
  text: string
  usage: LanguageModelUsage
  documentLogUuid?: string
  providerLog?: ProviderLog
}

export type ChainStepTextResponse = BaseResponse & {
  streamType: 'text'
  toolCalls: ToolCall[]
}

export type ChainStepObjectResponse = BaseResponse & {
  streamType: 'object'
  object: any
}

export type ChainStepResponse<T extends StreamType> = T extends 'text'
  ? ChainStepTextResponse
  : T extends 'object'
    ? ChainStepObjectResponse
    : never

export enum LogSources {
  API = 'api',
  Playground = 'playground',
  Evaluation = 'evaluation',
  User = 'user',
  SharedPrompt = 'shared_prompt',
}

export enum ErrorableEntity {
  DocumentLog = 'document_log',
  EvaluationResult = 'evaluation_result',
}

export enum StreamEventTypes {
  Latitude = 'latitude-event',
  Provider = 'provider-event',
}

export enum ChainEventTypes {
  Error = 'chain-error',
  Step = 'chain-step',
  Complete = 'chain-complete',
  StepComplete = 'chain-step-complete',
}

export type ProviderData =
  | TextStreamPart<Record<string, CoreTool>>
  | ObjectStreamPart<Record<string, CoreTool>>
  | ObjectStreamPart<unknown>
export type ProviderDataType = ProviderData['type']

export type LatitudeEventData =
  | {
      type: ChainEventTypes.Step
      config: Config
      isLastStep: boolean
      messages: Message[]
      documentLogUuid?: string
    }
  | {
      type: ChainEventTypes.StepComplete
      response: ChainStepResponse<StreamType>
      documentLogUuid?: string
    }
  | {
      type: ChainEventTypes.Complete
      config: Config
      messages?: Message[]
      object?: any
      response: ChainStepResponse<StreamType>
      documentLogUuid?: string
    }
  | {
      type: ChainEventTypes.Error
      error: Error
    }

export type ChainEvent =
  | {
      data: LatitudeEventData
      event: StreamEventTypes.Latitude
    }
  | {
      data: ProviderData
      event: StreamEventTypes.Provider
    }

export enum EvaluationMetadataType {
  LlmAsJudgeAdvanced = 'llm_as_judge',
  LlmAsJudgeSimple = 'llm_as_judge_simple',
  Manual = 'manual',
}

export enum EvaluationMode {
  Live = 'live',
  Batch = 'batch',
}

export enum EvaluationResultableType {
  Boolean = 'evaluation_resultable_booleans',
  Text = 'evaluation_resultable_texts',
  Number = 'evaluation_resultable_numbers',
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
}

export type ChainCallResponseDto =
  | Omit<ChainStepResponse<'object'>, 'documentLogUuid' | 'providerLog'>
  | Omit<ChainStepResponse<'text'>, 'documentLogUuid' | 'providerLog'>

type ChainEventDtoResponse =
  | Omit<ChainStepResponse<'object'>, 'providerLog'>
  | Omit<ChainStepResponse<'text'>, 'providerLog'>

// FIXME: Move to @latitude-data/constants
export type RunSyncAPIResponse = {
  uuid: string
  conversation: Message[]
  response: ChainCallResponseDto
}

// FIXME: Move to @latitude-data/constants
export type ChatSyncAPIResponse = RunSyncAPIResponse

export type ChainEventDto =
  | ProviderData
  | {
      type: ChainEventTypes.Step
      config: Config
      isLastStep: boolean
      messages: Message[]
      uuid?: string
    }
  | {
      type: ChainEventTypes.StepComplete
      response: ChainEventDtoResponse
      uuid?: string
    }
  | {
      type: ChainEventTypes.Complete
      config: Config
      messages?: Message[]
      object?: any
      response: ChainEventDtoResponse
      uuid?: string
    }
  | {
      type: ChainEventTypes.Error
      error: {
        name: string
        message: string
        stack?: string
      }
    }

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
  duration: number | null
  cost: number
}

export type SerializedDocumentLog = SerializedProviderLog & {
  prompt: string
  parameters: Record<string, unknown>
}

export const SERIALIZED_DOCUMENT_LOG_FIELDS = [
  'messages',
  'context',
  'response',
  'config',
  'duration',
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

const userContentSchema = z.array(
  z
    .object({
      type: z.literal('text'),
      text: z.string(),
    })
    .or(
      z.object({
        type: z.literal('image'),
        image: z
          .string()
          .or(z.instanceof(Uint8Array))
          .or(z.instanceof(Buffer))
          .or(z.instanceof(ArrayBuffer))
          .or(z.instanceof(URL)),
      }),
    ),
)

export const messageSchema = z
  .object({
    role: z.literal('system'),
    content: z.string(),
  })
  .or(
    z.object({
      role: z.literal('user'),
      name: z.string().optional(),
      content: userContentSchema,
    }),
  )
  .or(
    z.object({
      role: z.literal('assistant'),
      content: z.string().or(
        z.array(
          z.object({
            type: z.literal('tool-call'),
            toolCallId: z.string(),
            toolName: z.string(),
            args: z.record(z.any()),
          }),
        ),
      ),
      toolCalls: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          arguments: z.record(z.any()),
        }),
      ),
    }),
  )
  .or(
    z.object({
      role: z.literal('tool'),
      content: z.array(
        z.object({
          type: z.literal('tool-result'),
          toolCallId: z.string(),
          toolName: z.string(),
          result: z.string(),
          isError: z.boolean().optional(),
        }),
      ),
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

export interface ProjectStats {
  totalTokens: number
  totalRuns: number
  totalDocuments: number
  runsPerModel: Record<string, number>
  costPerModel: Record<string, number>
  rollingDocumentLogs: Array<{ date: string; count: number }>
  totalEvaluations: number
  totalEvaluationRuns: number
  evaluationCosts: Array<{
    evaluationName: string
    cost: number
  }>
}

export type CsvData = {
  headers: string[]
  data: {
    record: Record<string, string>
    info: { columns: { name: string }[] }
  }[]
}

export enum SpanKind {
  Internal = 'internal',
  Server = 'server',
  Client = 'client',
  Producer = 'producer',
  Consumer = 'consumer',
}
