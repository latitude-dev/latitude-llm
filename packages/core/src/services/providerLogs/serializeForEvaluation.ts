
import { objectToString } from '@latitude-data/constants'
import type { MessageRole } from '@latitude-data/constants/messages'
import {
  Message,
  SerializedConversation,
  SerializedProviderLog,
} from '../../constants'
import { type ProviderLog } from '../../schema/models/types/ProviderLog'
import { ProviderLogDto } from '../../schema/types'
import { buildProviderLogResponse } from './buildResponse'

export function formatConversation(
  providerLog: ProviderLogDto | ProviderLog,
): SerializedConversation {
  const messages: Message[] = [...(providerLog.messages || [])]

  if (providerLog.output) {
    messages.push(...(providerLog.output as Message[]))
  } else if ((providerLog as ProviderLogDto).response) {
    messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: (providerLog as ProviderLogDto).response }],
      toolCalls: providerLog.toolCalls,
    })
  } else if ((providerLog as ProviderLog).responseText) {
    messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: (providerLog as ProviderLog).responseText! }],
      toolCalls: providerLog.toolCalls,
    })
  } else if ((providerLog as ProviderLog).responseObject) {
    messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: objectToString((providerLog as ProviderLog).responseObject) }],
      toolCalls: [],
    })
  }

  return formatMessages(messages) as SerializedConversation
}

export function formatContext(
  providerLog: ProviderLog | ProviderLogDto,
): string {
  const messages = providerLog.messages || []
  let formattedConversation = ''

  messages.forEach((message) => {
    const speaker = message.role.charAt(0).toUpperCase() + message.role.slice(1)
    let content = ''
    if (typeof message.content === 'string') {
      content = message.content
    } else if (Array.isArray(message.content)) {
      content = message.content
        .map((item) => {
          switch (item.type) {
            case 'text':
              return item.text
            case 'image':
              return '[IMAGE]'
            case 'file':
              return '[FILE]'
          }
        })
        .join('\n')
    }

    formattedConversation += `${speaker}:\n${content}\n\n`
  })

  return formattedConversation.trim()
}

function formatMessages(messages: Message[]) {
  messages = messages.map((message) => {
    if (Array.isArray(message.content)) {
      message.content = message.content.map((content) => {
        delete (content as any)?._promptlSourceMap
        return content
      }) as typeof message.content
    }
    return message
  })

  const filterMessages = (role: MessageRole) =>
    messages.filter((m) => m.role === role)

  const formatRoleMessages = (role: MessageRole) => {
    const roleMessages = filterMessages(role)
    return {
      all: roleMessages,
      first: roleMessages[0] || null,
      last: roleMessages[roleMessages.length - 1] || null,
    }
  }

  return {
    all: messages,
    first: messages[0] || null,
    last: messages[messages.length - 1] || null,
    user: formatRoleMessages('user'),
    system: formatRoleMessages('system'),
    assistant: formatRoleMessages('assistant'),
  }
}

// TODO(evalsv2): This is v1 deprecated but is mantained
// for backwards compatibility with v1 llm evaluations
export function serializeForEvaluation(
  providerLog: ProviderLog | ProviderLogDto,
): SerializedProviderLog {
  const response = buildProviderLogResponse(providerLog as ProviderLog)
  providerLog = { ...providerLog, response } as ProviderLogDto

  return {
    messages: formatConversation(providerLog),
    context: formatContext(providerLog),
    toolCalls: providerLog.toolCalls,
    response,
    config: providerLog.config,
    cost: (providerLog.costInMillicents ?? 0) / 1000,
    tokens: providerLog.tokens ?? 0,
    duration: (providerLog.duration ?? 0) / 1000,
  }
}
