import {
  ContentType,
  Message as ConversationMessage,
  MessageRole,
} from '@latitude-data/constants'
import { Message } from '@latitude-data/web-ui/molecules/ChatWrapper'

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
