import type {
  Message as CompilerMessage,
  ToolCall,
} from '@latitude-data/compiler'
import {
  CompletionTokenUsage,
  CoreTool,
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

export type ChainStepTextResponse = {
  text: string
  usage: CompletionTokenUsage
  toolCalls: ToolCall[]
  documentLogUuid?: string
}
export type ChainStepObjectResponse = {
  object: any
  text: string
  usage: CompletionTokenUsage
  documentLogUuid?: string
}

export type ChainTextResponse = ChainStepTextResponse & {
  providerLog: ProviderLog
}
export type ChainObjectResponse = ChainStepObjectResponse & {
  providerLog: ProviderLog
}
export type ChainStepResponse = ChainStepTextResponse | ChainStepObjectResponse
export type ChainCallResponse = ChainTextResponse | ChainObjectResponse

export enum LogSources {
  API = 'api',
  Playground = 'playground',
  Evaluation = 'evaluation',
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
      response: ChainStepResponse
      documentLogUuid?: string
    }
  | {
      type: ChainEventTypes.Complete
      config: Config
      messages?: Message[]
      object?: any
      response: ChainCallResponse
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
  ChainCallResponse,
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
      response: Omit<ChainStepResponse, 'providerLog'>
      uuid?: string
    }
  | {
      type: ChainEventTypes.Complete
      config: Config
      messages?: Message[]
      object?: any
      response: Omit<ChainCallResponse, 'providerLog'>
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
