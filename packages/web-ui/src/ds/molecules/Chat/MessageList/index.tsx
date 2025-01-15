'use client'

import { Message as ConversationMessage } from '@latitude-data/compiler'

import { Message } from '../Message'
import { ToolCallResponse } from '@latitude-data/constants'

export function MessageList({
  messages,
  parameters,
  collapseParameters,
  submitToolResponse,
}: {
  messages: ConversationMessage[]
  parameters?: string[]
  collapseParameters?: boolean
  submitToolResponse?: (toolResponse: ToolCallResponse) => void
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
          submitToolResponse={submitToolResponse}
        />
      ))}
    </div>
  )
}
