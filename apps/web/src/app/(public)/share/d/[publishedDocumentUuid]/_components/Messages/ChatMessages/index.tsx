import { Conversation } from '@latitude-data/constants/messages'
import { ErrorMessage, MessageList } from '$/components/ChatWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { StreamMessage } from '$/components/PlaygroundCommon/StreamMessage'

export function ChatMessages({
  conversation,
  responseStream,
  reasoningStream,
  chainLength,
  error,
}: {
  responseStream: string | undefined
  reasoningStream?: string | undefined
  conversation: Conversation | undefined
  chainLength: number
  error: Error | undefined
}) {
  if (!conversation) return null
  if (!conversation.messages) return null
  if (chainLength < 1) return null
  if (chainLength >= conversation.messages.length) return null

  return (
    <>
      {conversation.messages.length > chainLength ? (
        <>
          <Text.H4M>Chat</Text.H4M>
          <MessageList messages={conversation!.messages.slice(chainLength)} />
        </>
      ) : null}
      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <StreamMessage
          responseStream={responseStream}
          reasoningStream={reasoningStream}
          messages={conversation.messages}
          chainLength={chainLength}
        />
      )}
    </>
  )
}
