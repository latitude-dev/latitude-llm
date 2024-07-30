import { Message as ConversationMessage } from '@latitude-data/compiler'

import { Message, MessageProps } from '../Message'

export function MessageList({
  messages,
  variant,
}: {
  messages: ConversationMessage[]
  variant?: MessageProps['variant']
}) {
  return messages.map((message, index) => (
    <Message
      key={index}
      role={message.role}
      content={message.content}
      variant={variant}
    />
  ))
}
