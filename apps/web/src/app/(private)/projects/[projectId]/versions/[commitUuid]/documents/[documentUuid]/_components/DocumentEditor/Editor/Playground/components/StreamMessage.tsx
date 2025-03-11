import {
  ContentType,
  Message as ConversationMessage,
  MessageRole,
} from '@latitude-data/compiler'
import { Message } from '@latitude-data/web-ui'

export function StreamMessage({
  responseStream,
  messages,
  chainLength,
}: {
  responseStream: string | undefined
  messages: ConversationMessage[]
  chainLength: number
}) {
  if (responseStream === undefined) return null
  if (messages.length < chainLength - 1) {
    return (
      <Message
        role={MessageRole.assistant}
        content={[{ type: ContentType.text, text: responseStream }]}
        animatePulse
      />
    )
  }

  return (
    <Message
      role={MessageRole.assistant}
      content={[{ type: ContentType.text, text: responseStream }]}
    />
  )
}
