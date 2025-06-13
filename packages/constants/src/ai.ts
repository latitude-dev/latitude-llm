import { Message, ToolCall } from './events/compiler'
import { FinishReason, LanguageModelUsage, TextStreamPart, Tool } from 'ai'
import { JSONSchema7 } from 'json-schema'
import { z } from 'zod'

import { ProviderLog } from './models'
import { LatitudeEventData, LegacyChainEventTypes } from './events'
import { ParameterType } from './config'
import { AzureConfig, LatitudePromptConfig } from './latitudePromptSchema'

export type AgentToolsMap = Record<string, string> // { [toolName]: agentPath }

export type ToolDefinition = JSONSchema7 & {
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JSONSchema7>
    required?: string[]
    additionalProperties: boolean
  }
}

export type VercelProviderTool = {
  type: 'provider-defined'
  id: `${string}.${string}`
  args: Record<string, unknown>
  parameters: z.ZodObject<{}, 'strip', z.ZodTypeAny, {}, {}>
}

export type VercelTools = Record<string, VercelProviderTool | ToolDefinition>

export type ToolDefinitionsMap = Record<string, ToolDefinition>
export type ToolsItem =
  | ToolDefinitionsMap // - tool_name: <tool_definition>
  | string // - latitude/* (no spaces)

// Config supported by Vercel
export type VercelConfig = {
  provider: string
  model: string
  url?: string
  cacheControl?: boolean
  schema?: JSONSchema7
  parameters?: Record<string, { type: ParameterType }>
  tools?: VercelTools
  azure?: AzureConfig
}

export type PartialPromptConfig = Omit<LatitudePromptConfig, 'provider'>

export type ProviderData = TextStreamPart<Record<string, Tool>>

export type ChainEventDto = ProviderData | LatitudeEventData

export type ChainCallResponseDto =
  | Omit<ChainStepResponse<'object'>, 'documentLogUuid' | 'providerLog'>
  | Omit<ChainStepResponse<'text'>, 'documentLogUuid' | 'providerLog'>

export type ChainEventDtoResponse =
  | Omit<ChainStepResponse<'object'>, 'providerLog'>
  | Omit<ChainStepResponse<'text'>, 'providerLog'>

export type StreamType = 'object' | 'text'
type BaseResponse = {
  text: string
  usage: LanguageModelUsage
  documentLogUuid?: string
  providerLog?: ProviderLog
}

export type ChainStepTextResponse = BaseResponse & {
  streamType: 'text'
  reasoning?: string | undefined
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

export enum StreamEventTypes {
  Latitude = 'latitude-event',
  Provider = 'provider-event',
}

export type LegacyChainEvent =
  | {
      data: LegacyLatitudeEventData
      event: StreamEventTypes.Latitude
    }
  | {
      data: ProviderData
      event: StreamEventTypes.Provider
    }

export type LegacyLatitudeStepEventData = {
  type: LegacyChainEventTypes.Step
  config: LatitudePromptConfig
  isLastStep: boolean
  messages: Message[]
  documentLogUuid?: string
}

export type LegacyLatitudeStepCompleteEventData = {
  type: LegacyChainEventTypes.StepComplete
  response: ChainStepResponse<StreamType>
  documentLogUuid?: string
}

export type LegacyLatitudeChainCompleteEventData = {
  type: LegacyChainEventTypes.Complete
  config: LatitudePromptConfig
  messages?: Message[]
  object?: any
  response: ChainStepResponse<StreamType>
  finishReason: FinishReason
  documentLogUuid?: string
}

export type LegacyLatitudeChainErrorEventData = {
  type: LegacyChainEventTypes.Error
  error: Error
}

export type LegacyLatitudeEventData =
  | LegacyLatitudeStepEventData
  | LegacyLatitudeStepCompleteEventData
  | LegacyLatitudeChainCompleteEventData
  | LegacyLatitudeChainErrorEventData

export type RunSyncAPIResponse = {
  uuid: string
  conversation: Message[]
  toolRequests: ToolCall[]
  response: ChainCallResponseDto
  agentResponse?: { response: string } | Record<string, unknown>
}

export type ChatSyncAPIResponse = RunSyncAPIResponse

export const toolCallResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  result: z.unknown(),
  isError: z.boolean().optional(),
  text: z.string().optional(),
})

export type ToolCallResponse = z.infer<typeof toolCallResponseSchema>
