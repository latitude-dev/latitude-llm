import {
  Config,
  Message,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { FinishReason } from 'ai'
import {
  ChainStepResponse,
  LegacyVercelSDKVersion4Usage,
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
  ToolResult = 'tool-result',
  ToolsStarted = 'tools-started',
}

type PromptSource = {
  commitUuid?: string
  documentUuid?: string
  evaluationUuid?: string
}

interface GenericLatitudeEventData {
  type: ChainEventTypes
  timestamp: number
  messages: Message[]
  uuid: string
  source?: PromptSource
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
  tokenUsage: LegacyVercelSDKVersion4Usage
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
  response: ChainStepResponse<StreamType> | undefined
  toolCalls: ToolCall[]
  tokenUsage: LegacyVercelSDKVersion4Usage
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

// Just a type helper for ChainStreamManager. Omit<LatitudeEventData, 'timestamp' | 'messages' | 'uuid'> does not work.
// prettier-ignore
export type OmittedLatitudeEventData =
  | Omit<LatitudeChainStartedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeStepStartedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeProviderStartedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeProviderCompletedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeToolsStartedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeToolCompletedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeStepCompletedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeChainCompletedEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeChainErrorEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>
  | Omit<LatitudeIntegrationWakingUpEventData, 'timestamp' | 'messages' | 'uuid' | 'source'>

export type ChainEvent =
  | {
      event: StreamEventTypes.Latitude
      data: LatitudeEventData
    }
  | {
      event: StreamEventTypes.Provider
      data: ProviderData
    }
