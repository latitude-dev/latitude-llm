'use client'

import { Message as ConversationMessage } from '@latitude-data/compiler'

import { Message } from '../Message'

export function MessageList({
  messages,
  parameters,
  collapseParameters,
}: {
  messages: ConversationMessage[]
  parameters?: Record<string, unknown>
  collapseParameters?: boolean
}) {
  return (
    <div className='flex flex-col gap-4'>
      {messages.map((message, index) => (
        <Message
          key={index}
          role={message.role}
          content={message.content}
          parameters={parameters}
          collapseParameters={collapseParameters}
        />
      ))}
    </div>
  )
}
