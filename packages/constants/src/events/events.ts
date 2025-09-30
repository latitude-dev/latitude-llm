import {
  Config,
  Message,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { FinishReason, LanguageModelUsage } from 'ai'
import {
  ChainStepResponse,
  ProviderData,
  StreamEventTypes,
  StreamType,
} from '..'
import { ChainError, RunErrorCodes } from '../errors'

export enum ChainEventTypes {
  ChainCompleted = 'chain-completed',
  ChainError = 'chain-error',
  ChainStarted = 'chain-started',
  IntegrationWakingUp = 'integration-waking-up',
  ProviderCompleted = 'provider-completed',
  ProviderStarted = 'provider-started',
  StepCompleted = 'step-completed',
  StepStarted = 'step-started',
  ToolCompleted = 'tool-completed',
  ToolsRequested = 'tools-requested', // TODO(compiler): remove
  ToolResult = 'tool-result',
  ToolsStarted = 'tools-started',
  RunQueued = 'run-queued',
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

export interface LatitudeIntegrationWakingUpEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.IntegrationWakingUp
  integrationName: string
}

// TODO(compiler): remove
export interface LatitudeToolsRequestedEventData
  extends GenericLatitudeEventData {
  type: ChainEventTypes.ToolsRequested
  tools: ToolCall[]
}

export interface LatitudeRunQueuedEventData extends GenericLatitudeEventData {
  type: ChainEventTypes.RunQueued
  jobId: string
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
  | LatitudeIntegrationWakingUpEventData
  | LatitudeRunQueuedEventData

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
  | Omit<LatitudeRunQueuedEventData, 'messages' | 'uuid'>

export type ChainEvent =
  | {
      event: StreamEventTypes.Latitude
      data: LatitudeEventData
    }
  | {
      event: StreamEventTypes.Provider
      data: ProviderData
    }
