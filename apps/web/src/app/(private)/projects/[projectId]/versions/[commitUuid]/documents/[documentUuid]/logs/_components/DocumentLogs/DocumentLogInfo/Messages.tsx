import { useMemo } from 'react'

import { AssistantMessage, Message, MessageRole } from '@latitude-data/compiler'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { MessageList, Text } from '@latitude-data/web-ui'

export function DocumentLogMessages({
  providerLogs,
}: {
  providerLogs?: ProviderLogDto[]
}) {
  const providerLog = providerLogs?.[providerLogs.length - 1]

  const messages = useMemo<Message[]>(() => {
    if (!providerLog) return [] as Message[]
    if (!providerLog.response) return providerLog.messages

    const responseMessage = {
      role: MessageRole.assistant,
      content: providerLog.response,
      toolCalls: providerLog.toolCalls,
    } as AssistantMessage

    return [...(providerLog.messages as Message[]), responseMessage]
  }, [providerLog])

  if (!providerLog) {
    return (
      <Text.H5 color='foregroundMuted' centered>
        There are no messages generated for this log
      </Text.H5>
    )
  }

  return <MessageList messages={messages} />
}
