import { useMemo, useState } from 'react'

import { Message, MessageRole } from '@latitude-data/compiler'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { MessageList, SwitchToogle, Text } from '@latitude-data/web-ui'

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

export function DocumentLogMessages({
  documentLog,
  messages,
}: {
  documentLog: DocumentLogWithMetadataAndError
  messages: Message[]
}) {
  const sourceMapAvailable = useMemo(() => {
    return messages.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [documentLog.uuid, messages])
  const [expandParameters, setExpandParameters] = useState(!sourceMapAvailable)

  if (!messages.length) {
    return (
      <Text.H5 color='foregroundMuted' centered>
        There are no messages generated for this log
      </Text.H5>
    )
  }

  return (
    <div className='flex flex-col gap-3 flex-grow flex-shrink min-h-0'>
      <div className='flex flex-row items-center justify-between w-full'>
        <Text.H6M>Messages</Text.H6M>
        <div className='flex flex-row gap-2 items-center'>
          <Text.H6M>Expand parameters</Text.H6M>
          <SwitchToogle
            checked={expandParameters}
            onCheckedChange={setExpandParameters}
            disabled={!sourceMapAvailable}
          />
        </div>
      </div>
      <MessageList
        messages={messages}
        parameters={documentLog.parameters}
        collapseParameters={!expandParameters}
      />
    </div>
  )
}
