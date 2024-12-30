import { Message, ToolCall } from '@latitude-data/compiler'
import {
  CoreTool,
  LanguageModelUsage,
  ObjectStreamPart,
  TextStreamPart,
} from 'ai'
import { JSONSchema7 } from 'json-schema'
import { z } from 'zod'

import { ProviderLog } from './models'

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

export type ChainCallResponseDto =
  | Omit<ChainStepResponse<'object'>, 'documentLogUuid' | 'providerLog'>
  | Omit<ChainStepResponse<'text'>, 'documentLogUuid' | 'providerLog'>

type ChainEventDtoResponse =
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

export type ChainEvent =
  | {
      data: LatitudeEventData
      event: StreamEventTypes.Latitude
    }
  | {
      data: ProviderData
      event: StreamEventTypes.Provider
    }

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

// FIXME: Move to @latitude-data/constants
export type RunSyncAPIResponse = {
  uuid: string
  conversation: Message[]
  response: ChainCallResponseDto
}

// FIXME: Move to @latitude-data/constants
export type ChatSyncAPIResponse = RunSyncAPIResponse
