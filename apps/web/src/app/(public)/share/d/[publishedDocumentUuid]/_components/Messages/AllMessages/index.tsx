import {
  ErrorMessage,
  MessageList,
  MessageSkeleton,
  ReactStateDispatch,
} from '@latitude-data/web-ui'
import {
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/compiler'
import { StreamMessage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/Chat'
import { ExpandMessages } from '../ExpandMessages'
import { useToolContentMap } from 'node_modules/@latitude-data/web-ui/src/lib/hooks/useToolContentMap'

export function AllMessages({
  messages,
  error,
  responseStream,
  conversation,
  chainLength,
  setPromptVisibility,
  isLoadingPrompt,
}: {
  messages: ConversationMessage[]
  error: Error | undefined
  responseStream: string | undefined
  conversation: Conversation | undefined
  chainLength: number
  setPromptVisibility: ReactStateDispatch<boolean>
  isLoadingPrompt: boolean
}) {
  const toolContentMap = useToolContentMap(messages)
  if (isLoadingPrompt) return <MessageSkeleton role='assistant' />

  return (
    <>
      <MessageList
        messages={messages.slice(0, chainLength - 1)}
        toolContentMap={toolContentMap}
      />
      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <StreamMessage
          responseStream={responseStream}
          messages={conversation?.messages ?? []}
          chainLength={chainLength}
        />
      )}

      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <>
          <ExpandMessages
            isExpanded
            onToggleShowPromptMessages={setPromptVisibility}
          />
          <MessageList
            messages={messages.slice(chainLength - 1, chainLength) ?? []}
            toolContentMap={toolContentMap}
          />
        </>
      )}
    </>
  )
}
