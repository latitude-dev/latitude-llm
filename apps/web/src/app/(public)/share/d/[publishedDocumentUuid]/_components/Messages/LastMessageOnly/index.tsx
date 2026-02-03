import { LastMessage } from '../../SharedDocument/RunPrompt/usePrompt'
import {
  Message as ConversationMessage,
  MessageContent,
  MessageRole,
} from '@latitude-data/constants/messages'
import { ExpandMessages } from '../ExpandMessages'
import { ErrorMessage, Message } from '$/components/ChatWrapper'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useEffect, useState } from 'react'
import { DebugMessage } from '$/components/ChatWrapper/Message/DebugMessage'

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
  reasoningStream,
  error,
}: {
  isLoading: L
  message: L extends true ? ConversationMessage : undefined
  responseStream: string | undefined
  reasoningStream?: string | undefined
  error: Error | undefined
}) {
  if (error) {
    return <ErrorMessage error={error} />
  }

  if (isLoading) {
    return (
      <DebugMessage
        role={MessageRole.assistant}
        content={[
          ...(reasoningStream
            ? [
                {
                  type: 'reasoning',
                  text: reasoningStream,
                } as MessageContent,
              ]
            : []),
          ...(responseStream
            ? [
                {
                  type: 'text',
                  text: responseStream ?? '',
                } as MessageContent,
              ]
            : []),
        ]}
      />
    )
  }

  return <Message role={message!.role} content={message!.content} />
}

export function LastMessageOnly({
  lastMessage,
  error,
  responseStream,
  reasoningStream,
  setPromptVisibility,
  isStreaming,
  isLoadingPrompt,
}: {
  lastMessage: LastMessage | undefined
  responseStream: string | undefined
  reasoningStream?: string | undefined
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
        reasoningStream={reasoningStream}
        error={error}
      />
    </>
  )
}
