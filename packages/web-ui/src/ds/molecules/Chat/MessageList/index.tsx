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
  return messages.map((message, index) => (
    <>
      {separator && index > 0 && (
        <div
          key={`${index}-separator`}
          className='h-px min-h-px w-full bg-border'
        />
      )}
      <Message
        key={index}
        role={message.role}
        content={message.content}
        variant={variant}
        layout={messageLayout}
        size={size}
      />
    </>
  ))
}
