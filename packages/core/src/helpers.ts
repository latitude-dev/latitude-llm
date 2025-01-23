import { z } from 'zod'
import { CsvData, MAX_STEPS_CONFIG_NAME, ParameterType } from './constants'
import { ProviderApiKey, ProviderLogDto } from './schema/types'

import type {
  Message,
  AssistantMessage,
  MessageContent,
  ToolCall,
  ToolRequestContent,
  ToolContent,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  ChainStepResponse,
  StreamType,
  ToolCallResponse,
} from '@latitude-data/constants'

const DEFAULT_OBJECT_TO_STRING_MESSAGE =
  'Error: Provider returned an object that could not be stringified'
export function objectToString(
  object: any,
  message = DEFAULT_OBJECT_TO_STRING_MESSAGE,
) {
  try {
    if (!object) return ''

    return JSON.stringify(object, null, 2)
  } catch (error) {
    return message
  }
}

export function promptConfigSchema({
  providers,
}: {
  providers: ProviderApiKey[]
}) {
  const providerNames = providers.map((provider) => provider.name)

  return z.object({
    provider: z
      .string({
        required_error: `You must select a provider.\nFor example: 'provider: ${providerNames[0] ?? '<your-provider-name>'}'`,
      })
      .refine((p) => providers.find((provider) => provider.name === p), {
        message: `Provider not available. You must use one of the following:\n${providerNames.map((p) => `'${p}'`).join(', ')}`,
      }),
    model: z.string({
      required_error: `You must select the model.\nFor example: 'model: 'gpt-4o'`,
    }),
    temperature: z.number().min(0).max(2).optional(),
    parameters: z
      .record(
        z.object({
          type: z.nativeEnum(ParameterType),
        }),
      )
      .optional(),
    [MAX_STEPS_CONFIG_NAME]: z.number().min(1).max(150).optional(),
  })
}

export function buildCsvFile(csvData: CsvData, name: string): File {
  const headers = csvData.headers.map((h) => JSON.stringify(h)).join(',')
  const rows = csvData.data.map((row) => Object.values(row.record).join(','))
  const csv = [headers, ...rows].join('\n')
  return new File([csv], `${name}.csv`, { type: 'text/csv' })
}

type BuildMessageParams<T extends StreamType> = T extends 'object'
  ? {
      type: 'object'
      data?: {
        object: any | undefined
        text: string | undefined
      }
    }
  : {
      type: 'text'
      data?: {
        text: string | undefined
        toolCalls?: ToolCall[]
        toolCallResponses?: ToolCallResponse[]
      }
    }

function parseToolResponseResult(result: string) {
  try {
    return JSON.parse(result)
  } catch (error) {
    return { result }
  }
}

export function buildResponseMessage<T extends StreamType>({
  type,
  data,
}: BuildMessageParams<T>) {
  if (!data) return undefined

  if (type === 'text' && data.toolCalls && data.toolCallResponses) {
    throw new Error(
      'A message cannot have both toolCalls and toolCallResponses',
    )
  }

  const toolCallResponses =
    type === 'text' ? (data.toolCallResponses ?? []) : []

  const text = data.text
  const object = type === 'object' ? data.object : undefined
  const toolCalls = type === 'text' ? (data.toolCalls ?? []) : []
  let content: MessageContent[] = []

  if (object) {
    content.push({
      type: 'text',
      text: objectToString(object),
    } as MessageContent)
  } else if (text && text.length > 0) {
    content.push({
      type: 'text',
      text: text,
    } as MessageContent)
  }

  if (toolCalls.length > 0) {
    const toolContents = toolCalls.map((toolCall) => {
      return {
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments,
      } as ToolRequestContent
    })

    content = content.concat(toolContents)
  }

  if (toolCallResponses.length > 0) {
    const toolResponseContents = toolCallResponses.map((toolCallResponse) => {
      return {
        type: 'tool-result',
        toolCallId: toolCallResponse.id,
        toolName: toolCallResponse.name,
        result:
          typeof toolCallResponse.result === 'string'
            ? parseToolResponseResult(toolCallResponse.result)
            : toolCallResponse.result,
        isError: toolCallResponse.isError || false,
      }
    })

    content = content.concat(toolResponseContents as unknown as ToolContent[])
  }

  if (!content.length) return undefined

  if (toolCallResponses.length > 0) {
    return {
      role: 'tool',
      content,
    } as ToolMessage
  }

  return { role: 'assistant', content, toolCalls } as AssistantMessage
}

export function buildMessagesFromResponse<T extends StreamType>({
  response,
}: {
  response: ChainStepResponse<T>
}) {
  const type = response.streamType
  const message =
    type === 'object'
      ? buildResponseMessage<'object'>({
          type: 'object',
          data: {
            object: response.object,
            text: response.text,
          },
        })
      : type === 'text'
        ? buildResponseMessage<'text'>({
            type: 'text',
            data: { text: response.text, toolCalls: response.toolCalls },
          })
        : undefined

  return message ? ([message] as Message[]) : []
}

export function buildAllMessagesFromResponse<T extends StreamType>({
  response,
}: {
  response: ChainStepResponse<T>
}) {
  const previousMessages = response.providerLog?.messages ?? []
  const messages = buildMessagesFromResponse({ response })

  return [...previousMessages, ...messages]
}

export function buildConversation(providerLog: ProviderLogDto) {
  let messages: Message[] = [...providerLog.messages]

  const message = buildResponseMessage({
    type: 'text',
    data: {
      text: providerLog.response,
      toolCalls: providerLog.toolCalls,
    },
  })

  if (message) {
    messages.push(message)
  }

  return messages
}
