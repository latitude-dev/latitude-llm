import { LastMessage } from '../../SharedDocument/usePrompt'
import {
  ContentType,
  Message as ConversationMessage,
} from '@latitude-data/compiler'
import { ExpandMessages } from '../ExpandMessages'
import {
  ErrorMessage,
  Message,
} from '@latitude-data/web-ui/molecules/ChatWrapper'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { MessageItem } from '@latitude-data/web-ui/molecules/ChatWrapper'
import { MessageItemContent } from '@latitude-data/web-ui/molecules/ChatWrapper'
import { useEffect, useState } from 'react'

const streamBuilder = (chunks: string[]) => {
  return async function* () {
    for (const chunk of chunks) {
      // Simulate delay from server
      await new Promise((resolve) => setTimeout(resolve, 20))
      yield chunk
    }
  }
}

export function useFakeStream({
  lastMessage,
}: {
  lastMessage: LastMessage | undefined
}) {
  const [fakeIsStreaming, setFakeStremaing] = useState(true)
  const [fakeResponseStream, setFakeResponse] = useState<string | undefined>()
  useEffect(() => {
    if (!fakeIsStreaming) return

    const deltas = lastMessage?.deltas ?? []
    async function runStream() {
      if (!deltas.length) return

      const fakeStream = streamBuilder(deltas)
      let response = ''

      for await (const chunk of fakeStream()) {
        response += chunk
        setFakeResponse(response)
      }

      setFakeStremaing(false)
    }

    runStream()
  }, [fakeIsStreaming, lastMessage?.deltas])
  return { fakeIsStreaming, fakeResponseStream }
}

function ChainResponseMessage<L extends boolean>({
  isLoading,
  message,
  responseStream,
  error,
}: {
  isLoading: L
  message: L extends true ? ConversationMessage : undefined
  responseStream: string | undefined
  error: Error | undefined
}) {
  if (error) {
    return <ErrorMessage error={error} />
  }

  if (isLoading) {
    return (
      <MessageItem badgeLabel='Assistant' badgeVariant='yellow'>
        {({ collapsedMessage }) =>
          !responseStream ? (
            <LoadingText alignX='left' />
          ) : (
            <MessageItemContent
              content={[
                {
                  type: ContentType.text,
                  text: responseStream ?? '',
                },
              ]}
              collapsedMessage={collapsedMessage}
            />
          )
        }
      </MessageItem>
    )
  }

  return <Message role={message!.role} content={message!.content} />
}

export function LastMessageOnly({
  lastMessage,
  error,
  responseStream,
  setPromptVisibility,
  isStreaming,
  isLoadingPrompt,
}: {
  lastMessage: LastMessage | undefined
  responseStream: string | undefined
  error: Error | undefined
  setPromptVisibility: ReactStateDispatch<boolean>
  isStreaming: boolean
  isLoadingPrompt: boolean
}) {
  const message = lastMessage?.lastMessage
  return (
    <>
      <ExpandMessages
        isLoading={isLoadingPrompt}
        isExpanded={false}
        onToggleShowPromptMessages={setPromptVisibility}
      />
      <ChainResponseMessage
        isLoading={isStreaming || !message}
        message={message}
        responseStream={responseStream}
        error={error}
      />
    </>
  )
}
