'use client'

import { Fragment, useState } from 'react'

import { Message as ConversationMessage } from '@latitude-data/compiler'

import { Button } from '../../../atoms'
import { Message, MessageProps } from '../Message'

export function MessageList({
  messages,
  variant,
  messageLayout,
  separator = false,
  collapsable = false,
  size,
}: {
  messages: ConversationMessage[]
  variant?: MessageProps['variant']
  messageLayout?: MessageProps['layout']
  collapsable?: boolean
  size?: MessageProps['size']
  separator?: boolean
}) {
  const [isCollapsed, setIsCollapsed] = useState(
    collapsable && messages.length > 1,
  )

  const visibleMessages = isCollapsed ? messages.slice(-1) : messages
  const hiddenMessagesCount = messages.length - visibleMessages.length

  return (
    <div className='flex flex-col gap-4'>
      {isCollapsed && messages.length > 1 && (
        <div className='relative cursor-pointer h-24 overflow-hidden'>
          <div className='opacity-50 pointer-events-none absolute top-0 left-0 right-0 scale-90 origin-top'>
            <Message
              role={messages[messages.length - 2]!.role}
              content={messages[messages.length - 2]!.content}
              variant={variant}
              layout={messageLayout}
              size={size}
            />
          </div>
          <div className='absolute inset-0 bg-gradient-to-t from-white via-white to-transparent' />
          <div className='absolute bottom-0 left-0 right-0 text-center p-2 text-sm text-gray-600'>
            <Button variant='secondary' onClick={() => setIsCollapsed(false)}>
              {hiddenMessagesCount} previous{' '}
              {hiddenMessagesCount > 1 ? 'messages' : 'message'}
            </Button>
          </div>
        </div>
      )}
      {visibleMessages.map((message, index) => (
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
      {!isCollapsed && collapsable && messages.length > 1 && (
        <div className='text-center cursor-pointer text-sm text-gray-600 hover:text-gray-800'>
          <Button variant='secondary' onClick={() => setIsCollapsed(true)}>
            Collapse conversation
          </Button>
        </div>
      )}
    </div>
  )
}
