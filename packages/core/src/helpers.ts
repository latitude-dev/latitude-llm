import { z } from 'zod'
import { CsvData, ParameterType } from './constants'
import { ProviderApiKey, ProviderLogDto } from './schema/types'

import {
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  ToolCall,
  ToolRequestContent,
} from '@latitude-data/compiler'
import { StreamType } from '@latitude-data/constants'

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
        text: string
        toolCalls: ToolCall[]
      }
    }
export function buildResponseMessage<T extends StreamType>({
  type,
  data,
}: BuildMessageParams<T>) {
  let message: Message = {
    role: MessageRole.assistant,
    content: [] as MessageContent[],
    toolCalls: [],
  }
  if (!data) return undefined

  const text = data.text
  const object = type === 'object' ? data.object : undefined
  const toolCalls = type === 'text' ? (data.toolCalls ?? []) : []
  let content: MessageContent[] = []

  if (text && text.length > 0) {
    content.push({
      type: ContentType.text,
      text: text,
    })
  }

  if (object) {
    content.push({
      type: ContentType.text,
      text: objectToString(object),
    })
  }

  if (toolCalls.length > 0) {
    const toolContents = toolCalls.map((toolCall) => {
      return {
        type: ContentType.toolCall,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments,
      } as ToolRequestContent
    })

    message.toolCalls = toolCalls
    content = content.concat(toolContents)
  }

  message.content = content

  return content.length > 0 ? message : undefined
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
