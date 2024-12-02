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
  if (isLoadingPrompt) return <MessageSkeleton role='assistant' />

  return (
    <>
      <div className='opacity-60'>
        <MessageList messages={messages.slice(0, chainLength - 1)} />
        {error ? (
          <ErrorMessage error={error} />
        ) : (
          <StreamMessage
            responseStream={responseStream}
            conversation={conversation}
            chainLength={chainLength}
          />
        )}
      </div>

      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <>
          <ExpandMessages
            isExpanded
            onToggleShowPromptMessages={setPromptVisibility}
          />
          {(messages.length ?? 0) === chainLength && (
            <MessageList
              messages={messages.slice(chainLength - 1, chainLength) ?? []}
            />
          )}
        </>
      )}
    </>
  )
}
