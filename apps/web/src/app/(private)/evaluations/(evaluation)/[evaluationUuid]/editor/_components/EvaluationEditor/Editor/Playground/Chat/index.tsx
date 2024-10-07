import { useCallback, useEffect, useRef, useState } from 'react'

import {
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/compiler'
import {
  ChainEventTypes,
  EvaluationDto,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import {
  Button,
  ErrorMessage,
  MessageList,
  Text,
  useAutoScroll,
} from '@latitude-data/web-ui'
import { runPromptAction } from '$/actions/prompts/run'
import {
  StreamMessage,
  Timer,
  TokenUsage,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/Chat'
import { readStreamableValue } from 'ai/rsc'

export default function Chat({
  clearChat,
  evaluation,
  parameters,
}: {
  clearChat: () => void
  evaluation: EvaluationDto
  parameters: Record<string, string>
}) {
  const [error, setError] = useState<Error | undefined>()
  const [tokens, setTokens] = useState<number>(0)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const [startTime, _] = useState(performance.now())
  const [endTime, setEndTime] = useState<number>()
  const containerRef = useRef<HTMLDivElement>(null)
  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })

  const runChainOnce = useRef(false)
  // Index where the chain ends and the chat begins
  const [chainLength, setChainLength] = useState<number>(Infinity)
  const [conversation, setConversation] = useState<Conversation | undefined>()
  const [responseStream, setResponseStream] = useState<string | undefined>()

  const addMessageToConversation = useCallback(
    (message: ConversationMessage) => {
      let newConversation: Conversation
      setConversation((prevConversation) => {
        newConversation = {
          ...prevConversation,
          messages: [...(prevConversation?.messages ?? []), message],
        } as Conversation
        return newConversation
      })
      return newConversation!
    },
    [],
  )

  const runEvaluation = useCallback(async () => {
    setError(undefined)
    setResponseStream(undefined)

    let response = ''
    let messagesCount = 0

    const [data, error] = await runPromptAction({
      prompt: evaluation.metadata.prompt,
      parameters,
    })
    if (error) {
      setError(error)
      return
    }

    const { output } = data!

    for await (const serverEvent of readStreamableValue(output)) {
      if (!serverEvent) continue

      const { event, data } = serverEvent
      const hasMessages = 'messages' in data
      if (hasMessages) {
        data.messages.forEach(addMessageToConversation)
        messagesCount += data.messages.length
      }

      switch (event) {
        case StreamEventTypes.Latitude: {
          if (data.type === ChainEventTypes.Step) {
            if (data.isLastStep) setChainLength(messagesCount + 1)
          } else if (data.type === ChainEventTypes.Complete) {
            setResponseStream(undefined)
            setTokens(data.response.usage.totalTokens)
            setEndTime(performance.now())
          } else if (data.type === ChainEventTypes.Error) {
            setError(new Error(data.error.message))
          }
          break
        }

        case StreamEventTypes.Provider: {
          if (data.type === 'text-delta') {
            response += data.textDelta
            setResponseStream(response)
          }
          break
        }
        default:
          break
      }
    }
  }, [parameters, runPromptAction])

  useEffect(() => {
    if (runChainOnce.current) return

    runChainOnce.current = true // Prevent double-running when StrictMode is enabled
    runEvaluation()
  }, [runEvaluation])

  return (
    <div className='flex flex-col h-full'>
      <div
        ref={containerRef}
        className='flex flex-col gap-3 h-full overflow-y-auto custom-scrollbar pb-12'
      >
        <Text.H6M>Prompt</Text.H6M>
        <MessageList
          messages={conversation?.messages.slice(0, chainLength - 1) ?? []}
        />
        {(conversation?.messages.length ?? 0) >= chainLength && (
          <>
            <MessageList
              messages={
                conversation?.messages.slice(chainLength - 1, chainLength) ?? []
              }
            />
            {endTime && <Timer timeMs={endTime - startTime} />}
          </>
        )}
        {(conversation?.messages.length ?? 0) > chainLength && (
          <>
            <Text.H6M>Chat</Text.H6M>
            <MessageList messages={conversation!.messages.slice(chainLength)} />
          </>
        )}
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
      <div className='flex relative flex-row w-full items-center justify-center'>
        <TokenUsage
          isScrolledToBottom={isScrolledToBottom}
          tokens={tokens}
          responseStream={responseStream}
        />
      </div>
      <div className='flex items-center justify-center'>
        <Button fancy onClick={clearChat}>
          Clear chat
        </Button>
      </div>
    </div>
  )
}
