import { useMemo } from 'react'

import { AssistantMessage, Message, MessageRole } from '@latitude-data/compiler'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { MessageList } from '@latitude-data/web-ui'

export function EvaluationResultMessages({
  providerLog,
}: {
  providerLog?: ProviderLogDto
}) {
  const messages = useMemo<Message[]>(() => {
    if (!providerLog) return [] as Message[]

    const responseMessage = {
      role: MessageRole.assistant,
      content: providerLog.response,
      toolCalls: providerLog.toolCalls,
    } as AssistantMessage

    return [...(providerLog.messages as Message[]), responseMessage]
  }, [providerLog])

  if (!providerLog) return null
  return (
    <div className='flex flex-col gap-4 py-6 w-full max-h-full overflow-y-auto'>
      <MessageList
        messages={messages}
        messageLayout='vertical'
        separator
        size='small'
      />
    </div>
  )
}
