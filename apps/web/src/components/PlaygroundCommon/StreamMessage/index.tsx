import {
  ContentType,
  Message as ConversationMessage,
  MessageRole,
} from '@latitude-data/compiler'
import { Message } from '@latitude-data/web-ui/molecules/ChatWrapper'

export function StreamMessage({
  responseStream,
  reasoningStream,
  messages,
  chainLength,
}: {
  responseStream: string | undefined
  reasoningStream?: string | undefined
  messages: ConversationMessage[]
  chainLength: number
}) {
  if (responseStream === undefined && reasoningStream === undefined) return null

  if (messages.length < chainLength - 1) {
    return (
      <Message
        role={MessageRole.assistant}
        content={[
          {
            type: ContentType.text,
            reasoning: reasoningStream,
            isReasoning: true,
            text: responseStream,
          },
        ]}
        animatePulse
      />
    )
  }

  return (
    <Message
      role={MessageRole.assistant}
      content={[
        {
          type: ContentType.text,
          reasoning: reasoningStream,
          isReasoning: true,
          text: responseStream,
        },
      ]}
    />
  )
}
