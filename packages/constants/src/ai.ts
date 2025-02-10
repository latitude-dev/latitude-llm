import { Message, ToolCall } from '@latitude-data/compiler'
import {
  CoreTool,
  FinishReason,
  LanguageModelUsage,
  ObjectStreamPart,
  TextStreamPart,
} from 'ai'
import { JSONSchema7 } from 'json-schema'
import { z } from 'zod'

import { ProviderLog } from './models'
import { LatitudeEventData, LegacyChainEventTypes } from './events'

export const azureConfig = z.object({
  resourceName: z.string({
    message: 'Azure resourceName is required',
  }),
  apiVersion: z.string().optional(),
})

type AzureConfig = z.infer<typeof azureConfig>

const googleCategorySettings = z.union([
  z.literal('HARM_CATEGORY_HATE_SPEECH'),
  z.literal('HARM_CATEGORY_DANGEROUS_CONTENT'),
  z.literal('HARM_CATEGORY_HARASSMENT'),
  z.literal('HARM_CATEGORY_SEXUALLY_EXPLICIT'),
])
const googleThresholdSettings = z.union([
  z.literal('HARM_BLOCK_THRESHOLD_UNSPECIFIED'),
  z.literal('BLOCK_LOW_AND_ABOVE'),
  z.literal('BLOCK_MEDIUM_AND_ABOVE'),
  z.literal('BLOCK_ONLY_HIGH'),
  z.literal('BLOCK_NONE'),
])

export const googleConfig = z.object({
  structuredOutputs: z.boolean().optional(),
  cachedContent: z.string().optional(),
  safetySettings: z
    .array(
      z.object({
        category: googleCategorySettings,
        threshold: googleThresholdSettings,
      }),
    )
    .optional(),
})

type GoogleConfig = z.infer<typeof googleConfig>

export type PartialConfig = Omit<Config, 'provider'>

export type Config = {
  provider: string
  model: string
  url?: string
  cacheControl?: boolean
  schema?: JSONSchema7
  azure?: AzureConfig
  google?: GoogleConfig
  tools?: Record<
    string,
    { description?: string; parameters: Record<string, any> }
  >
}

export type ProviderData =
  | TextStreamPart<Record<string, CoreTool>>
  | ObjectStreamPart<Record<string, CoreTool>>
  | ObjectStreamPart<unknown>

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
  config: Config
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
  config: Config
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
