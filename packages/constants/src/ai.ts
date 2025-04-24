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
import { LatitudeTool, ParameterType } from './config'

export type AgentToolsMap = Record<string, string> // { [toolName]: agentPath }

export const azureConfig = z.object({
  resourceName: z
    .string({
      message: 'Azure resourceName is required',
    })
    .optional()
    .describe(
      'The resource name is used in the assembled URL: https://{resourceName}.openai.azure.com/openai/deployments/{modelId}{path}. You can use baseURL instead to specify the URL prefix.',
    ),
  apiKey: z
    .string()
    .optional()
    .describe(
      'API key that is being sent using the api-key header. It defaults to the AZURE_API_KEY environment variable.',
    ),
  apiVersion: z
    .string()
    .optional()
    .describe('Sets a custom api version. Defaults to 2024-10-01-preview.'),
  baseUrl: z
    .string()
    .optional()
    .describe(
      'Use a different URL prefix for API calls, e.g. to use proxy servers. Either this or resourceName can be used. When a baseURL is provided, the resourceName is ignored. With a baseURL, the resolved URL is {baseURL}/{modelId}{path}.',
    ),
  headers: z
    .record(z.string())
    .optional()
    .describe('Custom headers to include in the requests.'),
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

export type ToolDefinition = JSONSchema7 & {
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JSONSchema7>
    required?: string[]
    additionalProperties?: boolean
  }
}

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
  azure?: AzureConfig
  google?: GoogleConfig
  disableAgentOptimization?: boolean
  tools?: ToolDefinitionsMap
}

// Prompt config supported by Latitude
export type PromptConfig = Omit<VercelConfig, 'tools'> & {
  type?: 'agent' | undefined
  tools?:
    | ToolDefinitionsMap // Old tools schema
    | (ToolDefinitionsMap | string)[] // New tools schema
  latitudeTools?: LatitudeTool[] // deprecated
  agents?: string[]
}

export type PartialPromptConfig = Omit<PromptConfig, 'provider'>

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
  config: PromptConfig
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
  config: PromptConfig
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
