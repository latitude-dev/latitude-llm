import { LastMessage } from '../../SharedDocument/usePrompt'
import { ContentType } from '@latitude-data/compiler'
import { ExpandMessages } from '../ExpandMessages'
import {
  ErrorMessage,
  MessageItem,
  ReactStateDispatch,
  LoadingText,
  roleToString,
  roleVariant,
  MessageItemContent,
} from '@latitude-data/web-ui'
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
      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <MessageItem
          badgeLabel={
            isStreaming || !message ? 'Assistant' : roleToString(message.role)
          }
          badgeVariant={
            isStreaming || !message ? 'yellow' : roleVariant(message.role)
          }
        >
          {({ collapsedMessage }) => (
            <>
              {!message && !responseStream ? (
                <LoadingText alignX='left' />
              ) : (
                <MessageItemContent
                  content={
                    !message?.content
                      ? [
                          {
                            type: ContentType.text,
                            text: responseStream ?? '',
                          },
                        ]
                      : message.content
                  }
                  collapsedMessage={collapsedMessage}
                />
              )}
            </>
          )}
        </MessageItem>
      )}
    </>
  )
}
