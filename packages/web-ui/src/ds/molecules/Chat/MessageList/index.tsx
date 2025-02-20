'use client'

import { Message as ConversationMessage } from '@latitude-data/compiler'

import { Message } from '../Message'
import type { AgentToolsMap } from '@latitude-data/core/browser'

export function MessageList({
  messages,
  parameters,
  collapseParameters,
  agentToolsMap,
}: {
  messages: ConversationMessage[]
  parameters?: string[]
  collapseParameters?: boolean
  agentToolsMap?: AgentToolsMap
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
          agentToolsMap={agentToolsMap}
        />
      ))}
    </div>
  )
}
