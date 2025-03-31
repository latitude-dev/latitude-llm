import { StreamMessage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/components'
import { Conversation } from '@latitude-data/compiler'
import {
  ErrorMessage,
  MessageList,
} from '@latitude-data/web-ui/molecules/ChatWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
export function ChatMessages({
  conversation,
  responseStream,
  chainLength,
  error,
}: {
  responseStream: string | undefined
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
          messages={conversation.messages}
          chainLength={chainLength}
        />
      )}
    </>
  )
}
