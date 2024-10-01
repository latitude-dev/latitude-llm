'use client'

import { Fragment } from 'react'

import { Message as ConversationMessage } from '@latitude-data/compiler'

import { Message } from '../Message'

export function MessageList({ messages }: { messages: ConversationMessage[] }) {
  return (
    <div className='flex flex-col gap-4'>
      {messages.map((message, index) => (
        <Fragment key={index}>
          <Message role={message.role} content={message.content} />
        </Fragment>
      ))}
    </div>
  )
}
