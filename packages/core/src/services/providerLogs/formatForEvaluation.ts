import { MessageRole } from '@latitude-data/compiler'

import { Message, ProviderLog } from '../../browser'

export function formatConversation(providerLog: ProviderLog) {
  const messages: Message[] = [...(providerLog.messages || [])]

  // Add the response as an assistant message if it exists
  if (providerLog.responseText) {
    messages.push({
      role: MessageRole.assistant,
      content: providerLog.responseText,
      toolCalls: providerLog.toolCalls,
    })
  }

  return formatMessages(messages)
}

export function formatContext(providerLog: ProviderLog) {
  return formatMessages(providerLog.messages)
}

function formatMessages(messages: Message[]) {
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
