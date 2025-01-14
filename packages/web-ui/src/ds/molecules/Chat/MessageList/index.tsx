'use client'

import {
  Message as ConversationMessage,
  ToolCall,
} from '@latitude-data/compiler'

import { Message } from '../Message'
import { AddToolResponseData } from '../types'

export function MessageList({
  messages,
  parameters,
  collapseParameters,
  addToolResponseData,
}: {
  messages: ConversationMessage[]
  parameters?: string[]
  collapseParameters?: boolean
  addToolResponseData?: AddToolResponseData | undefined
}) {
  return (
    <div className='flex flex-col gap-4'>
      {messages.map((message, index) => {
        const toolCalls = Array.isArray(message.toolCalls)
          ? (message.toolCalls as ToolCall[])
          : undefined
        return (
          <Message
            key={index}
            role={message.role}
            content={message.content}
            parameters={parameters}
            collapseParameters={collapseParameters}
            toolCalls={toolCalls}
            addToolResponseData={addToolResponseData}
          />
        )
      })}
    </div>
  )
}
