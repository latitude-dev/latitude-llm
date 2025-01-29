import { ContentType, MessageRole } from '@latitude-data/compiler'

import {
  Message,
  ProviderLog,
  ProviderLogDto,
  SerializedConversation,
  SerializedProviderLog,
} from '../../browser'
import { buildProviderLogResponse } from './buildResponse'
import { objectToString } from '@latitude-data/constants'

export function formatConversation(
  providerLog: ProviderLogDto | ProviderLog,
): SerializedConversation {
  const messages: Message[] = [...(providerLog.messages || [])]

  if ((providerLog as ProviderLogDto).response) {
    messages.push({
      role: MessageRole.assistant,
      content: (providerLog as ProviderLogDto).response,
      toolCalls: providerLog.toolCalls,
    })
  } else if ((providerLog as ProviderLog).responseText) {
    messages.push({
      role: MessageRole.assistant,
      content: (providerLog as ProviderLog).responseText!,
      toolCalls: providerLog.toolCalls,
    })
  } else if ((providerLog as ProviderLog).responseObject) {
    messages.push({
      role: MessageRole.assistant,
      content: objectToString((providerLog as ProviderLog).responseObject),
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
            case ContentType.text:
              return item.text
            case ContentType.image:
              return '[IMAGE]'
            case ContentType.file:
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
      })
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
    user: formatRoleMessages(MessageRole.user),
    system: formatRoleMessages(MessageRole.system),
    assistant: formatRoleMessages(MessageRole.assistant),
  }
}

export function serializeForEvaluation(
  providerLog: ProviderLog,
): SerializedProviderLog {
  const response = buildProviderLogResponse(providerLog)

  return {
    messages: formatConversation(providerLog),
    context: formatContext(providerLog),
    toolCalls: providerLog.toolCalls,
    response,
    config: providerLog.config,
    duration: providerLog.duration,
    cost: providerLog.costInMillicents / 1000,
  }
}
