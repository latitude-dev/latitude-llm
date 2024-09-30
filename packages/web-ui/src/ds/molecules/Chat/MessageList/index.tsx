'use client'

import { Fragment } from 'react'

import { Message as ConversationMessage } from '@latitude-data/compiler'

import { Message, MessageProps } from '../Message'

export function MessageList({
  messages,
  variant,
  messageLayout,
  separator = false,
  size,
}: {
  messages: ConversationMessage[]
  variant?: MessageProps['variant']
  messageLayout?: MessageProps['layout']
  size?: MessageProps['size']
  separator?: boolean
}) {
  return (
    <div className='flex flex-col gap-4'>
      {messages.map((message, index) => (
        <Fragment key={index}>
          {separator && index > 0 && (
            <div className='h-px min-h-px w-full bg-border' />
          )}
          <Message
            role={message.role}
            content={message.content}
            variant={variant}
            layout={messageLayout}
            size={size}
          />
        </Fragment>
      ))}
    </div>
  )
}
