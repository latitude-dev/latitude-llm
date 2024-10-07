import type {
  AssistantMessage,
  Message as CompilerMessage,
  SystemMessage,
  ToolCall,
  UserMessage,
} from '@latitude-data/compiler'
import {
  CoreTool,
  LanguageModelUsage,
  ObjectStreamPart,
  TextStreamPart,
} from 'ai'

import { ProviderLog } from './browser'
import { Config } from './services/ai'

export const LATITUDE_EVENT = 'latitudeEventsChannel'
export const LATITUDE_DOCS_URL = 'https://docs.latitude.so'
export const LATITUDE_EMAIL = 'hello@latitude.so'
export const LATITUDE_SLACK_URL =
  'https://trylatitude.slack.com/join/shared_invite/zt-17dyj4elt-rwM~h2OorAA3NtgmibhnLA#/shared-invite/email'
export const LATITUDE_HELP_URL = LATITUDE_SLACK_URL
export const HEAD_COMMIT = 'live'
export const MAX_FREE_RUNS = 50_000

export enum CommitStatus {
  All = 'all',
  Merged = 'merged',
  Draft = 'draft',
}

export {
  Providers,
  PROVIDER_MODELS,
  findFirstModelForProvider,
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
export type ChainStepTextResponse = {
  streamType: 'text'
  text: string
  usage: LanguageModelUsage
  toolCalls: ToolCall[]
  documentLogUuid?: string
  providerLog?: ProviderLog
}

export type ChainStepObjectResponse = {
  streamType: 'object'
  object: any
  text: string
  usage: LanguageModelUsage
  documentLogUuid?: string
  providerLog?: ProviderLog
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
}

export enum RunErrorCodes {
  Unknown = 'unknown_error',
  DefaultProviderExceededQuota = 'default_provider_exceeded_quota_error',
  DocumentConfigError = 'document_config_error',
  MissingProvider = 'missing_provider_error',
  ChainCompileError = 'chain_compile_error',
  AIRunError = 'ai_run_error',
  UnsupportedProviderResponseTypeError = 'unsupported_provider_response_type_error',
  AIProviderConfigError = 'ai_provider_config_error',
}

export type RunErrorDetails<C extends RunErrorCodes> =
  C extends RunErrorCodes.ChainCompileError
    ? { compileCode: string; message: string }
    : never
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
  LlmAsJudge = 'llm_as_judge',
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
}

export const REWARD_VALUES: Record<RewardType, number> = {
  [RewardType.GithubStar]: 1_000,
  [RewardType.Follow]: 2_000,
  [RewardType.Post]: 5_000,
  [RewardType.GithubIssue]: 10_000,
  [RewardType.Referral]: 5_000,
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

export type ChainCallResponseDto = Omit<
  ChainStepResponse<StreamType>,
  'documentLogUuid' | 'providerLog'
>

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
      response: Omit<ChainStepResponse<StreamType>, 'providerLog'>
      uuid?: string
    }
  | {
      type: ChainEventTypes.Complete
      config: Config
      messages?: Message[]
      object?: any
      response: Omit<ChainStepResponse<StreamType>, 'providerLog'>
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
  response: string | null
  config: object
  duration: number
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
]

export type SerializedEvaluationResult = Omit<
  SerializedProviderLog,
  'response'
> & {
  resultableType: EvaluationResultableType
  result: string | number | boolean
  reason: string | null
  evaluatedLog: SerializedDocumentLog
}
