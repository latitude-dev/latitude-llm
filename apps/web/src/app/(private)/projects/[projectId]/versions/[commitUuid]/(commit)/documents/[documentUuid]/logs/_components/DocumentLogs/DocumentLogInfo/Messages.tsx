import { useMemo } from 'react'

import { Message, MessageRole } from '@latitude-data/compiler'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { MessageList, Text } from '@latitude-data/web-ui'

export function useGetProviderLogMessages({
  providerLogs,
}: {
  providerLogs?: ProviderLogDto[]
}) {
  const providerLog = providerLogs?.[providerLogs.length - 1]
  return useMemo(() => {
    if (!providerLog) return { messages: [] as Message[], lastResponse: null }
    if (!providerLog.response) {
      return { messages: providerLog.messages, lastResponse: null }
    }

    const lastResponse = {
      role: MessageRole.assistant,
      content: providerLog!.response,
      toolCalls: providerLog!.toolCalls,
    }

    return {
      lastResponse,
      messages: [
        ...(providerLog!.messages as Message[]),
        lastResponse as unknown as Message,
      ],
    }
  }, [providerLog])
}

export function DocumentLogMessages({ messages }: { messages: Message[] }) {
  if (!messages.length) {
    return (
      <Text.H5 color='foregroundMuted' centered>
        There are no messages generated for this log
      </Text.H5>
    )
  }

  return <MessageList messages={messages} />
}
