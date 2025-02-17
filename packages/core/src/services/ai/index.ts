import { omit } from 'lodash-es'

import type { Message } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import {
  CoreMessage,
  CoreTool,
  jsonSchema,
  LanguageModel,
  ObjectStreamPart,
  streamObject as originalStreamObject,
  streamText as originalStreamText,
  smoothStream,
  StreamObjectResult,
  StreamTextResult,
  TextStreamPart,
} from 'ai'
import { JSONSchema7 } from 'json-schema'

import { ProviderApiKey, StreamType } from '../../browser'
import { Result, TypedResult } from '../../lib'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'
import { buildTools } from './buildTools'
import { handleAICallAPIError } from './handleError'
import { createProvider, PartialConfig } from './helpers'
import { Providers } from './providers/models'
import { applyAllRules } from './providers/rules'

const DEFAULT_AI_SDK_PROVIDER = {
  streamText: originalStreamText,
  streamObject: originalStreamObject,
}
type AISDKProvider = typeof DEFAULT_AI_SDK_PROVIDER
type AIReturnObject = {
  type: 'object'
  data: Pick<
    StreamObjectResult<unknown, unknown, never>,
    'fullStream' | 'object' | 'usage' | 'providerMetadata'
  > & {
    providerName: Providers
  }
}

// A stream of partial outputs. It uses the `experimental_output` specification.
// This could fix the issue with having a schema and tool calls in the same prompt.
// But requires more investigation. More info:
// https://vercel.com/blog/ai-sdk-4-1#structured-output-improvements
type PARTIAL_OUTPUT = object

type AIReturnText = {
  type: 'text'
  data: Pick<
    StreamTextResult<Record<string, CoreTool<any, any>>, PARTIAL_OUTPUT>,
    'fullStream' | 'text' | 'usage' | 'toolCalls' | 'providerMetadata'
  > & {
    providerName: Providers
  }
}

export type AIReturn<T extends StreamType> = T extends 'object'
  ? AIReturnObject
  : T extends 'text'
    ? AIReturnText
    : never

export type StreamChunk =
  | TextStreamPart<Record<string, CoreTool>>
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
  provider: apiProvider,
  prompt,
  messages: originalMessages,
  config: originalConfig,
  schema,
  output,
  customLanguageModel,
  aiSdkProvider,
}: {
  provider: ProviderApiKey
  config: PartialConfig
  messages: Message[]
  prompt?: string
  schema?: JSONSchema7
  customLanguageModel?: LanguageModel
  output?: ObjectOutput
  aiSdkProvider?: Partial<AISDKProvider>
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
  const { streamText, streamObject } = {
    ...DEFAULT_AI_SDK_PROVIDER,
    ...(aiSdkProvider || {}),
  }
  try {
    const rule = applyAllRules({
      providerType: apiProvider.provider,
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

    const { provider, token: apiKey, url } = apiProvider
    const config = rule.config as PartialConfig
    const messages = rule.messages
    const model = config.model
    const tools = config.tools
    const llmProvider = createProvider({
      messages,
      provider: apiProvider,
      apiKey,
      url: url ?? undefined,
      config,
    })

    if (llmProvider.error) return llmProvider

    const languageModel = customLanguageModel
      ? customLanguageModel
      : llmProvider.value(model, {
          cacheControl: config.cacheControl ?? false,
          // Propagate provider config options for this language model
          ...config,
        })
    const toolsResult = buildTools(tools)
    if (toolsResult.error) return toolsResult

    const commonOptions = {
      ...omit(config, ['schema']),
      model: languageModel,
      prompt,
      messages: messages as CoreMessage[],
      tools: toolsResult.value,
      experimental_telemetry: {
        isEnabled: true,
      },
    }

    if (schema && output) {
      const result = streamObject({
        ...commonOptions,
        schema: jsonSchema(schema),
        // output is valid but depending on the type of schema
        // there might be a mismatch (e.g you pass an object schema but the
        // output is "array"). Not really an issue we need to defend atm.
        output: output as any,
      })

      return Result.ok({
        type: 'object',
        data: {
          fullStream: result.fullStream,
          object: result.object,
          usage: result.usage,
          providerName: provider,
          providerMetadata: result.providerMetadata,
        },
      })
    }

    const result = streamText({
      ...commonOptions,
      experimental_transform: smoothStream(),
    })

    return Result.ok({
      type: 'text',
      data: {
        fullStream: result.fullStream,
        text: result.text,
        usage: result.usage,
        toolCalls: result.toolCalls,
        providerName: provider,
        providerMetadata: result.providerMetadata,
      },
    })
  } catch (e) {
    return handleAICallAPIError(e)
  }
}

export { estimateCost, getCostPer1M } from './estimateCost'
export type { Config, PartialConfig } from './helpers'
export {
  vertexConfigurationSchema,
  type VertexConfiguration,
} from './providers/helpers/vertex'
