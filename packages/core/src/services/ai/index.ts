import { omit } from 'lodash-es'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import type { Message } from '@latitude-data/constants/legacyCompiler'
import {
  jsonSchema,
  ObjectStreamPart,
  streamText as originalStreamText,
  stepCountIs,
  Output,
  StreamTextResult,
  TextStreamPart,
  Tool,
  StreamTextOnErrorCallback,
} from 'ai'
import { JSONSchema7 } from 'json-schema'
import { VercelConfig } from '@latitude-data/constants'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { StreamType } from '../../constants'
import { Result, TypedResult } from '../../lib/Result'
import { TelemetryContext } from '../../telemetry'
import { buildTools } from './buildTools'
import { getLanguageModel } from './getLanguageModel'
import { handleAICallAPIError } from './handleError'
import { createProvider } from './helpers'
import { Providers } from '@latitude-data/constants'
import { applyAllRules } from './providers/rules'

const DEFAULT_AI_SDK_PROVIDER = {
  streamText: originalStreamText,
}
type AISDKProvider = typeof DEFAULT_AI_SDK_PROVIDER

type PARTIAL_OUTPUT = object

type VercelAIReturn = Pick<
  StreamTextResult<Record<string, Tool<unknown, unknown>>, PARTIAL_OUTPUT>,
  | 'fullStream'
  | 'text'
  | 'usage'
  | 'toolCalls'
  | 'providerMetadata'
  | 'reasoning'
  | 'reasoningText'
  | 'finishReason'
  | 'response'
>

export type AIReturn<T extends StreamType> = Omit<
  VercelAIReturn,
  'reasoning' | 'reasoningText'
> & {
  type: T
  providerName: Providers
  reasoning: VercelAIReturn['reasoningText']
  object?: T extends 'object' ? PARTIAL_OUTPUT : undefined
}

export type StreamChunk =
  | TextStreamPart<Record<string, Tool>>
  | ObjectStreamPart<unknown>

export type ObjectOutput = 'object' | 'array' | 'no-schema' | undefined

/**
 * Vercel SDK has several ways to limit the number of steps an AI model can take.
 * But we are only interesting on supporting the old `maxSteps` config so
 * this is the way of translating it to `stopWhen` option.
 * Reference:
 * https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#stop-when
 */
function getStopWhen({ maxSteps }: { maxSteps?: number | undefined }) {
  return { stopWhen: stepCountIs(maxSteps ?? 1) }
}

export type OnErrorParameters = Parameters<StreamTextOnErrorCallback>[0]

export async function ai({
  context,
  provider,
  messages: originalMessages,
  config: originalConfig,
  onError,
  schema,
  output,
  aiSdkProvider,
  abortSignal,
}: {
  context: TelemetryContext
  provider: ProviderApiKey
  config: VercelConfig
  onError: (event: OnErrorParameters) => void
  messages: Message[]
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

    const stopWhen = getStopWhen({ maxSteps: config.maxSteps })
    const result = streamText({
      ...omit(config, ['schema']),
      ...stopWhen,
      messages,
      onError,
      model: languageModel,
      tools: toolsResult.value,
      abortSignal,
      maxOutputTokens: config.maxOutputTokens ?? config.maxTokens,
      providerOptions: config.providerOptions,
      experimental_telemetry: { isEnabled: false }, // Note: avoid conflicts with our own telemetry
      experimental_output: useSchema
        ? Output.object({ schema: jsonSchema(schema) })
        : undefined,
    })

    return Result.ok({
      finishReason: result.finishReason,
      fullStream: result.fullStream,
      providerMetadata: result.providerMetadata,
      providerName: providerType,
      reasoning: result.reasoningText,
      response: result.response,
      sources: result.sources,
      text: result.text,
      toolCalls: result.toolCalls,
      type: resultType,
      usage: result.totalUsage,
    })
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
