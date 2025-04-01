import { Message as ConversationMessage } from '@latitude-data/compiler'
import {
  ErrorMessage,
  MessageList,
} from '@latitude-data/web-ui/molecules/ChatWrapper'
import { StreamMessage } from './StreamMessage'
import { Timer } from './Timer'

type ChatMessagesProps = {
  messages: ConversationMessage[]
  parameters: Record<string, unknown>
  expandParameters: boolean
  agentToolsMap: Record<string, any> | undefined
  toolContentMap: Record<string, any>
  chainLength: number
  time?: number
  error?: Error
  streamingResponse?: string
}

export function ChatMessages({
  messages,
  parameters,
  expandParameters,
  agentToolsMap,
  toolContentMap,
  chainLength,
  time,
  error,
  streamingResponse,
}: ChatMessagesProps) {
  return (
    <>
      <MessageList
        messages={messages.slice(0, chainLength - 1) ?? []}
        parameters={Object.keys(parameters)}
        collapseParameters={!expandParameters}
        agentToolsMap={agentToolsMap}
        toolContentMap={toolContentMap}
      />
      {(messages.length ?? 0) >= chainLength && (
        <>
          <MessageList
            messages={messages.slice(chainLength - 1, chainLength) ?? []}
            toolContentMap={toolContentMap}
          />
          {time && <Timer timeMs={time} />}
        </>
      )}
      {(messages.length ?? 0) > chainLength && (
        <>
          <MessageList
            messages={messages.slice(chainLength)}
            toolContentMap={toolContentMap}
          />
        </>
      )}
      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <StreamMessage
          responseStream={streamingResponse}
          messages={messages}
          chainLength={chainLength}
        />
      )}
    </>
  )
}
