import { Config, Message, ToolCall } from '@latitude-data/compiler'
import {
  ChainStepResponse,
  ProviderData,
  StreamEventTypes,
  StreamType,
} from '..'
import { FinishReason, LanguageModelUsage } from 'ai'
import { ChainError, RunErrorCodes } from '../errors'

export enum ChainEventTypes {
  ChainStarted = 'chain-started',
  StepStarted = 'step-started',
  ProviderStarted = 'provider-started',
  ProviderCompleted = 'provider-completed',
  ToolsStarted = 'tools-started',
  ToolCompleted = 'tool-completed',
  StepCompleted = 'step-completed',
  ChainCompleted = 'chain-completed',
  ChainError = 'chain-error',
  ToolsRequested = 'tools-requested',
  IntegrationWakingUp = 'integration-waking-up',
}

interface GenericLatitudeEventData {
  type: ChainEventTypes
  messages: Message[]
  uuid: string
}

export interface LatitudeChainStartedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ChainStarted
}

export interface LatitudeStepStartedEventData extends GenericLatitudeEventData {
  type: ChainEventTypes.StepStarted
}

export interface LatitudeProviderStartedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ProviderStarted
  config: Config
}

export interface LatitudeProviderCompletedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ProviderCompleted
  providerLogUuid: string
  tokenUsage: LanguageModelUsage
  finishReason: FinishReason
  response: ChainStepResponse<StreamType>
}

export interface LatitudeToolsStartedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ToolsStarted
  tools: ToolCall[]
}

export interface LatitudeToolCompletedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ToolCompleted
}

export interface LatitudeStepCompletedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.StepCompleted
}

export interface LatitudeChainCompletedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ChainCompleted
  tokenUsage: LanguageModelUsage
  finishReason: FinishReason
}

export interface LatitudeChainErrorEventData extends GenericLatitudeEventData {
  type: ChainEventTypes.ChainError
  error: Error | ChainError<RunErrorCodes>
}

export interface LatitudeToolsRequestedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ToolsRequested
  tools: ToolCall[]
}

export interface LatitudeIntegrationWakingUpEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.IntegrationWakingUp
  integrationName: string
}

export type LatitudeEventData =
  | LatitudeChainStartedEventData
  | LatitudeStepStartedEventData
  | LatitudeProviderStartedEventData
  | LatitudeProviderCompletedEventData
  | LatitudeToolsStartedEventData
  | LatitudeToolCompletedEventData
  | LatitudeStepCompletedEventData
  | LatitudeChainCompletedEventData
  | LatitudeChainErrorEventData
  | LatitudeToolsRequestedEventData
  | LatitudeIntegrationWakingUpEventData

// Just a type helper for ChainStreamManager. Omit<LatitudeEventData, 'messages' | 'uuid'> does not work.
export type OmittedLatitudeEventData =
  | Omit<LatitudeChainStartedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeStepStartedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeProviderStartedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeProviderCompletedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeToolsStartedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeToolCompletedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeStepCompletedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeChainCompletedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeChainErrorEventData, 'messages' | 'uuid'>
  | Omit<LatitudeToolsRequestedEventData, 'messages' | 'uuid'>
  | Omit<LatitudeIntegrationWakingUpEventData, 'messages' | 'uuid'>

export type ChainEvent =
  | {
      event: StreamEventTypes.Latitude
      data: LatitudeEventData
    }
  | {
      event: StreamEventTypes.Provider
      data: ProviderData
    }
