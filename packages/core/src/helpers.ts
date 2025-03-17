import { type CsvData } from './constants'
import type { ProviderLogDto } from './schema/types'

import type { Message } from '@latitude-data/compiler'
import {
  buildResponseMessage,
  ChainStepResponse,
  StreamType,
} from '@latitude-data/constants'

export function buildCsvFile(csvData: CsvData, name: string): File {
  const headers = csvData.headers.map((h) => JSON.stringify(h)).join(',')
  const rows = csvData.data.map((row) => Object.values(row.record).join(','))
  const csv = [headers, ...rows].join('\n')
  return new File([csv], `${name}.csv`, { type: 'text/csv' })
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

export function formatMessage(message: Message) {
  let result = ''

  if (typeof message.content === 'string') {
    result = message.content
  } else {
    result = message.content
      .map((content) => {
        switch (content.type) {
          case 'text':
            return content.text
          case 'image':
            if (typeof content.image === 'string') {
              try {
                return new URL(content.image).toString()
              } catch {
                return '[IMAGE]'
              }
            }
            return '[IMAGE]'
          case 'file':
            if (typeof content.file === 'string') {
              try {
                return new URL(content.file).toString()
              } catch {
                return '[FILE]'
              }
            }
            return '[FILE]'
          case 'tool-call':
            try {
              return JSON.stringify(content)
            } catch {
              return '[TOOL CALL]'
            }
          case 'tool-result':
            try {
              return JSON.stringify(content)
            } catch {
              return '[TOOL RESULT]'
            }
        }
      })
      .join('\n')
  }

  return result
}

export function formatConversation(conversation: Message[]) {
  let result = ''

  for (const message of conversation) {
    const speaker = message.role.charAt(0).toUpperCase() + message.role.slice(1)
    result += `${speaker}: ${formatMessage(message)}\n\n`
  }

  return result
}
