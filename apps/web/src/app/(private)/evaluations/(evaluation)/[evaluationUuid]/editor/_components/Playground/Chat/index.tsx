import { useCallback, useEffect, useRef, useState } from 'react'

import {
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/compiler'
import {
  LegacyChainEventTypes,
  EvaluationDto,
  EvaluationMetadataType,
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
import useEvaluationPrompt from '$/stores/evaluationPrompt'
import { LanguageModelUsage } from 'ai'
import { readStreamableValue } from 'ai/rsc'

export default function Chat({
  clearChat,
  evaluation,
  parameters,
}: {
  clearChat: () => void
  evaluation: EvaluationDto
  parameters: Record<string, unknown>
}) {
  const [error, setError] = useState<Error | undefined>()
  const [usage, setUsage] = useState<LanguageModelUsage | undefined>()
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const [startTime, _] = useState(performance.now())
  const [endTime, setEndTime] = useState<number>()
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: prompt, isLoading } = useEvaluationPrompt({
    evaluationId: evaluation.id,
  })

  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })

  const runChainOnce = useRef(false)
  // Index where the chain ends and the chat begins
  const [chainLength, setChainLength] = useState<number>(Infinity)
  const [conversation, setConversation] = useState<Conversation | undefined>()
  const [responseStream, setResponseStream] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)

  const usePromptl =
    evaluation.metadataType !== EvaluationMetadataType.LlmAsJudgeAdvanced ||
    evaluation.metadata.promptlVersion !== 0

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
    if (!prompt) return
    setError(undefined)
    setResponseStream(undefined)
    setIsStreaming(true)
    let response = ''
    let messagesCount = 0

    const [data, error] = await runPromptAction({
      prompt,
      parameters,
      promptlVersion: usePromptl ? 1 : 0,
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
          if (data.type === LegacyChainEventTypes.Complete) {
            setChainLength(messagesCount)
            setResponseStream(undefined)
            setUsage(data.response.usage)
            setIsStreaming(false)
            setEndTime(performance.now())
          } else if (data.type === LegacyChainEventTypes.Error) {
            setError(new Error(data.error.message))
            setIsStreaming(false)
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
    setIsStreaming(false)
  }, [prompt, parameters, runPromptAction])

  useEffect(() => {
    if (isLoading) return
    if (runChainOnce.current) return

    runChainOnce.current = true // Prevent double-running when StrictMode is enabled
    runEvaluation()
  }, [runEvaluation, isLoading])

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
            messages={conversation?.messages ?? []}
            chainLength={chainLength}
          />
        )}
      </div>
      <div className='flex relative flex-row w-full items-center justify-center'>
        <TokenUsage
          isScrolledToBottom={isScrolledToBottom}
          usage={usage}
          isStreaming={isStreaming}
        />
      </div>
      <div className='flex items-center justify-center'>
        <Button
          disabled={isStreaming}
          fancy
          variant='outline'
          onClick={clearChat}
        >
          Clear chat
        </Button>
      </div>
    </div>
  )
}
