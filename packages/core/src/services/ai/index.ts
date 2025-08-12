import { omit } from 'lodash-es'

import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import type { Message } from '@latitude-data/constants/legacyCompiler'
import {
  ModelMessage,
  jsonSchema,
  ObjectStreamPart,
  streamText as originalStreamText,
  Output,
  smoothStream,
  StreamTextResult,
  TextStreamPart,
  Tool,
} from 'ai'
import { JSONSchema7 } from 'json-schema'

import { VercelConfig } from '@latitude-data/constants'
import { ProviderApiKey, StreamType } from '../../browser'
import { Result, TypedResult } from '../../lib/Result'
import { TelemetryContext } from '../../telemetry'
import { buildTools } from './buildTools'
import { getLanguageModel } from './getLanguageModel'
import { handleAICallAPIError } from './handleError'
import { createProvider } from './helpers'
import { Providers } from './providers/models'
import { applyAllRules } from './providers/rules'

const DEFAULT_AI_SDK_PROVIDER = {
  streamText: originalStreamText,
}
type AISDKProvider = typeof DEFAULT_AI_SDK_PROVIDER

type PARTIAL_OUTPUT = object

export type AIReturn<T extends StreamType> = Pick<
  StreamTextResult<Record<string, Tool<unknown, unknown>>, PARTIAL_OUTPUT>,
  | 'fullStream'
  | 'text'
  | 'usage'
  | 'toolCalls'
  | 'providerMetadata'
  | 'reasoningText'
  | 'finishReason'
  | 'response'
> & {
  type: T
  providerName: Providers
  object?: T extends 'object' ? PARTIAL_OUTPUT : undefined
}

export type StreamChunk =
  | TextStreamPart<Record<string, Tool>>
  | ObjectStreamPart<unknown>

export type ObjectOutput = 'object' | 'array' | 'no-schema' | undefined

export type ToolSchema<
  T extends Record<string, { type: string; description: string }> = {},
> = {
  description: string
  parameters: {
    type: 'object'
    properties: T
  }
}

export async function ai({
  context,
  provider,
  prompt,
  messages: originalMessages,
  config: originalConfig,
  schema,
  output,
  aiSdkProvider,
  abortSignal,
}: {
  context: TelemetryContext
  provider: ProviderApiKey
  config: VercelConfig
  messages: Message[]
  prompt?: string
  schema?: JSONSchema7
  output?: ObjectOutput
  aiSdkProvider?: Partial<AISDKProvider>
  abortSignal?: AbortSignal
}): Promise<
  TypedResult<
    AIReturn<StreamType>,
    ChainError<
      | RunErrorCodes.AIProviderConfigError
      | RunErrorCodes.AIRunError
      | RunErrorCodes.Unknown
    >
  >
> {
  const { streamText } = {
    ...DEFAULT_AI_SDK_PROVIDER,
    ...(aiSdkProvider || {}),
  }
  try {
    const rule = applyAllRules({
      providerType: provider.provider,
      messages: originalMessages,
      config: originalConfig,
    })

    if (rule.rules.length > 0) {
      return Result.error(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message:
            'There are rule violations:\n' +
            rule.rules.map((rule) => `- ${rule.ruleMessage}`).join('\n'),
        }),
      )
    }

    const { provider: providerType, token: apiKey, url } = provider
    const config = rule.config
    const messages = rule.messages
    const model = config.model
    const tools = config.tools
    const providerAdapterResult = createProvider({
      context,
      messages,
      provider: provider,
      apiKey,
      url: url ?? undefined,
      config,
    })

    if (providerAdapterResult.error) return providerAdapterResult

    const languageModel = getLanguageModel({
      llmProvider: providerAdapterResult.value,
      provider,
      config,
      model,
    })

    const toolsResult = buildTools(tools)
    if (toolsResult.error) return toolsResult

    const useSchema = schema && !!output && output !== 'no-schema'
    const resultType: StreamType = useSchema ? 'object' : 'text'

    const result = streamText({
      ...omit(config, ['schema']),
      model: languageModel,
      prompt,
      messages: messages as ModelMessage[],
      tools: toolsResult.value,
      abortSignal,
      providerOptions: config.providerOptions,
      experimental_telemetry: { isEnabled: false }, // Note: avoid conflicts with our own telemetry
      experimental_transform: smoothStream(),
      experimental_output: useSchema
        ? Output.object({ schema: jsonSchema(schema) })
        : undefined,
    })

    return Result.ok({
      type: resultType,
      providerName: providerType,
      fullStream: result.fullStream,
      text: result.text,
      reasoningText: result.reasoningText,
      usage: result.usage,
      toolCalls: result.toolCalls,
      providerMetadata: result.providerMetadata,
      sources: result.sources,
      finishReason: result.finishReason,
      response: result.response,
    });
  } catch (e) {
    return handleAICallAPIError(e)
  }
}

export { estimateCost, getCostPer1M } from './estimateCost'
export type { PartialConfig } from './helpers'
export {
  amazonBedrockConfigurationSchema,
  type AmazonBedrockConfiguration,
} from './providers/helpers/amazonBedrock'
export {
  vertexConfigurationSchema,
  type VertexConfiguration,
} from './providers/helpers/vertex'
