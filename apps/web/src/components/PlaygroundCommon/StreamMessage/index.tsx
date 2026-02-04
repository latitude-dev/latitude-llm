import {
  Message as ConversationMessage,
  ReasoningContent,
  TextContent,
} from '@latitude-data/constants/messages'
import { Message } from '$/components/ChatWrapper'

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

  const content = [
    ...(reasoningStream !== undefined
      ? [
          {
            type: 'reasoning',
            text: reasoningStream,
            isStreaming: true,
          } as ReasoningContent,
        ]
      : []),
    {
      type: 'text',
      text: responseStream,
    } as TextContent,
  ]

  if (messages.length < chainLength - 1) {
    return <Message role='assistant' content={content} animatePulse />
  }

  return <Message role='assistant' content={content} />
}
