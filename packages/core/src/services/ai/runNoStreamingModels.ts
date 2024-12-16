import {
  CoreMessage,
  generateObject,
  generateText,
  jsonSchema,
  LanguageModel,
} from 'ai'
import { JSONSchema7 } from 'json-schema'

import { Result } from '../../lib'
import { AITools } from './buildTools'
import { ObjectOutput, StreamChunk } from './index'
import { Providers } from './providers/models'

export async function runNoStreamingModels({
  schema,
  output,
  commonOptions,
  provider,
}: {
  schema: JSONSchema7 | undefined
  output: ObjectOutput | undefined
  commonOptions: {
    model: LanguageModel
    prompt: string | undefined
    messages: CoreMessage[]
    tools: AITools | undefined
    experimental_telemetry?: {
      isEnabled: boolean
    }
  }
  provider: Providers
}) {
  if (output && schema) {
    const result = await generateObject({
      ...commonOptions,
      schema: jsonSchema(schema),
      output: output as any,
    })

    const chunks: StreamChunk[] = [
      {
        type: 'object',
        object: result.object,
      },
      {
        type: 'finish',
        finishReason: result.finishReason,
        usage: result.usage,
        response: result.response,
      },
    ]

    const fullStream = new ReadableStream<StreamChunk>({
      start(controller: any) {
        chunks.forEach((chunk) => {
          controller.enqueue(chunk)
        })
        controller.close()
      },
    })

    return Result.ok({
      type: 'object' as 'object',
      data: {
        fullStream: fullStream as any,
        object: Promise.resolve(result.object),
        usage: Promise.resolve(result.usage),
        providerName: provider,
      },
    })
  }

  const result = await generateText(commonOptions)

  const chunks: StreamChunk[] = [
    {
      type: 'text-delta',
      textDelta: result.text,
    },
    {
      type: 'finish',
      finishReason: result.finishReason,
      usage: result.usage,
      response: result.response,
    },
  ]

  const fullStream = new ReadableStream<StreamChunk>({
    start(controller: any) {
      chunks.forEach((chunk) => {
        controller.enqueue(chunk)
      })
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
    type: 'text' as 'text',
    data: {
      fullStream: fullStream as any,
      text: Promise.resolve(result.text),
      usage: Promise.resolve(result.usage),
      toolCalls: Promise.resolve(toolCalls),
      providerName: provider,
    },
  })
}
