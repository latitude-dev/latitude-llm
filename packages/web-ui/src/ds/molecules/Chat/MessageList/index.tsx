'use client'

import { Fragment } from 'react'

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
        <Fragment key={index}>
          <Message
            role={message.role}
            content={message.content}
            parameters={parameters}
            collapseParameters={collapseParameters}
          />
        </Fragment>
      ))}
    </div>
  )
}
