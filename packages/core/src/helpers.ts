import { z } from 'zod'
import { CsvData, ParameterType } from './constants'
import { ProviderApiKey, ProviderLogDto } from './schema/types'

import {
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  ToolRequestContent,
} from '@latitude-data/compiler'

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

export function buildConversation(providerLog: ProviderLogDto) {
  let messages: Message[] = [...providerLog.messages]
  let message: Message | undefined = undefined

  if (providerLog.response && providerLog.response.length > 0) {
    message = {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          text: providerLog.response,
        },
      ],
      toolCalls: [],
    }
  }

  if (providerLog.toolCalls.length > 0) {
    const content = providerLog.toolCalls.map((toolCall) => {
      return {
        type: ContentType.toolCall,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments,
      } as ToolRequestContent
    })

    if (message) {
      message.content = (message.content as MessageContent[]).concat(content)
      message.toolCalls = providerLog.toolCalls
    } else {
      message = {
        role: MessageRole.assistant,
        content: content,
        toolCalls: providerLog.toolCalls,
      }
    }
  }

  if (message) {
    messages.push(message)
  }

  return messages
}
