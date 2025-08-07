import {
  ErrorMessage,
  MessageList,
  MessageSkeleton,
} from '$/components/ChatWrapper'
import { StreamMessage } from '$/components/PlaygroundCommon/StreamMessage'
import {
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/constants/legacyCompiler'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import { ExpandMessages } from '../ExpandMessages'

export function AllMessages({
  messages,
  error,
  responseStream,
  reasoningStream,
  conversation,
  chainLength,
  setPromptVisibility,
  isLoadingPrompt,
}: {
  messages: ConversationMessage[]
  error: Error | undefined
  responseStream: string | undefined
  reasoningStream: string | undefined
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
          reasoningStream={reasoningStream}
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
