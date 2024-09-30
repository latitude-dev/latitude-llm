import { useMemo } from 'react'

import { AssistantMessage, Message, MessageRole } from '@latitude-data/compiler'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { MessageList } from '@latitude-data/web-ui'

export function DocumentLogMessages({
  providerLogs,
}: {
  providerLogs?: ProviderLogDto[]
}) {
  const messages = useMemo<Message[]>(() => {
    const lastLog = providerLogs?.[providerLogs.length - 1]
    if (!lastLog) return [] as Message[]

    const responseMessage = {
      role: MessageRole.assistant,
      content: lastLog.response,
      toolCalls: lastLog.toolCalls,
    } as AssistantMessage

    return [...(lastLog.messages as Message[]), responseMessage]
  }, [providerLogs])

  if (!providerLogs) return null
  return (
    <MessageList
      messages={messages}
      messageLayout='vertical'
      separator
      size='small'
    />
  )
}
