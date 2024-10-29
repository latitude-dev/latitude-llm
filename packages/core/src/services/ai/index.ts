import { omit } from 'lodash-es'

import { Message } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import {
  CoreMessage,
  CoreTool,
  jsonSchema,
  LanguageModel,
  ObjectStreamPart,
  streamObject as originalStreamObject,
  streamText as originalStreamText,
  StreamObjectResult,
  StreamTextResult,
  TextStreamPart,
} from 'ai'
import { JSONSchema7 } from 'json-schema'

import { ProviderApiKey, StreamType } from '../../browser'
import { Result, TypedResult } from '../../lib'
import { ChainError } from '../chains/ChainErrors'
import { buildTools } from './buildTools'
import { handleAICallAPIError } from './handleError'
import { createProvider, PartialConfig } from './helpers'
import { UNSUPPORTED_STREAM_MODELS } from './providers/models'
import { applyCustomRules } from './providers/rules'
import { runNoStreamingModels } from './runNoStreamingModels'

const DEFAULT_AI_SDK_PROVIDER = {
  streamText: originalStreamText,
  streamObject: originalStreamObject,
}
type AISDKProvider = typeof DEFAULT_AI_SDK_PROVIDER
type AIReturnObject = {
  type: 'object'
  data: Pick<
    StreamObjectResult<unknown, unknown, never>,
    'fullStream' | 'object' | 'usage'
  >
}
type AIReturnText = {
  type: 'text'
  data: Pick<
    StreamTextResult<Record<string, CoreTool<any, any>>>,
    'fullStream' | 'text' | 'usage' | 'toolCalls'
  >
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
export async function ai({
  provider: apiProvider,
  prompt,
  messages: originalMessages,
  config,
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
    const rule = applyCustomRules({
      providerType: apiProvider.provider,
      messages: originalMessages,
    })

    const { provider, token: apiKey, url } = apiProvider
    const model = config.model

    const messages = rule?.messages ?? originalMessages
    const languageModelResult = createProvider({
      messages,
      provider,
      apiKey,
      config,
      ...(url ? { url } : {}),
    })

    if (languageModelResult.error) return languageModelResult

    const languageModel = customLanguageModel
      ? customLanguageModel
      : languageModelResult.value(model)
    const toolsResult = buildTools(config.tools)
    if (toolsResult.error) return toolsResult

    const commonOptions = {
      ...omit(config, ['schema']),
      model: languageModel,
      prompt,
      messages: messages as CoreMessage[],
      tools: toolsResult.value,
    }

    if (UNSUPPORTED_STREAM_MODELS.includes(model)) {
      return runNoStreamingModels({
        schema,
        output,
        commonOptions,
      })
    }

    if (schema && output) {
      const result = await streamObject({
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
        },
      })
    }

    const result = await streamText(commonOptions)
    return Result.ok({
      type: 'text',
      data: {
        fullStream: result.fullStream,
        text: result.text,
        usage: result.usage,
        toolCalls: result.toolCalls,
      },
    })
  } catch (e) {
    return handleAICallAPIError(e)
  }
}

export { estimateCost } from './estimateCost'
export type { Config, PartialConfig } from './helpers'
