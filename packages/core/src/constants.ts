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
export enum CommitStatus {
  All = 'all',
  Merged = 'merged',
  Draft = 'draft',
}

export { Providers, PROVIDER_MODELS } from './services/ai/providers/models'
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
  documentLogUuid: string
  providerLog: undefined
}
export type ChainStepObjectResponse = {
  object: any
  text: string
  usage: CompletionTokenUsage
  documentLogUuid: string
  providerLog: undefined
}

export type ChainTextResponse = Omit<ChainStepTextResponse, 'providerLog'> & {
  providerLog: ProviderLog
}
export type ChainObjectResponse = Omit<
  ChainStepObjectResponse,
  'providerLog'
> & {
  providerLog: ProviderLog
}
export type ChainStepResponse = ChainStepTextResponse | ChainStepObjectResponse
export type ChainCallResponse = ChainTextResponse | ChainObjectResponse

export enum LogSources {
  Playground = 'playground',
  API = 'api',
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

type LatitudeEventData =
  | {
      type: ChainEventTypes.Step
      config: Config
      isLastStep: boolean
      messages: Message[]
    }
  | {
      type: ChainEventTypes.StepComplete
      response: ChainStepResponse
    }
  | {
      type: ChainEventTypes.Complete
      config: Config
      messages?: Message[]
      object?: any
      response: ChainCallResponse
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
