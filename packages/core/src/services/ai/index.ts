import { omit } from 'lodash-es'

import { Message } from '@latitude-data/compiler'
import {
  CoreMessage,
  CoreTool,
  generateObject,
  generateText,
  jsonSchema,
  ObjectStreamPart,
  streamObject,
  StreamObjectResult,
  streamText,
  StreamTextResult,
  TextStreamPart,
} from 'ai'
import { JSONSchema7 } from 'json-schema'

import { ProviderApiKey, RunErrorCodes, StreamType } from '../../browser'
import { Result, TypedResult } from '../../lib'
import { ChainError } from '../chains/ChainErrors'
import { buildTools } from './buildTools'
import { createProvider, PartialConfig } from './helpers'
import { UNSUPPORTED_STREAM_MODELS } from './providers/models'

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

export async function ai({
  provider: apiProvider,
  prompt,
  messages,
  config,
  schema,
  output,
}: {
  provider: ProviderApiKey
  config: PartialConfig
  messages: Message[]
  prompt?: string
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema' | undefined
}): Promise<
  TypedResult<
    AIReturn<StreamType>,
    ChainError<RunErrorCodes.AIProviderConfigError>
  >
> {
  const { provider, token: apiKey, url } = apiProvider
  const model = config.model

  const languageModelResult = createProvider({
    messages,
    provider,
    apiKey,
    config,
    ...(url ? { url } : {}),
  })

  if (languageModelResult.error) return languageModelResult

  const languageModel = languageModelResult.value(model)
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
    if (output && schema) {
      const result = await generateObject({
        ...commonOptions,
        schema: jsonSchema(schema),
        output: output as any,
      })

      const fullStream = new ReadableStream<StreamChunk>({
        start(controller: any) {
          const streamChunk: StreamChunk = {
            type: 'object',
            object: result.object,
          }
          controller.enqueue(streamChunk)
          controller.close()
        },
      })

      return Result.ok({
        type: 'object',
        data: {
          fullStream: fullStream as any,
          object: Promise.resolve(result.object),
          usage: Promise.resolve(result.usage),
        },
      })
    }

    const result = await generateText(commonOptions)

    const fullStream = new ReadableStream<StreamChunk>({
      start(controller: any) {
        const streamChunk: StreamChunk = {
          type: 'text-delta',
          textDelta: result.text,
        }
        controller.enqueue(streamChunk)
        controller.close()
      },
    })

    const toolCalls = result.toolCalls.map((toolCall) => ({
      type: 'tool-call' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      args: toolCall.args,
    }))

    return Result.ok({
      type: 'text',
      data: {
        fullStream: fullStream as any,
        text: Promise.resolve(result.text),
        usage: Promise.resolve(result.usage),
        toolCalls: Promise.resolve(toolCalls),
      },
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
}

export { estimateCost } from './estimateCost'
export type { Config, PartialConfig } from './helpers'
