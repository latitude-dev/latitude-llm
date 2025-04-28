import {
  ContentType,
  Message,
  MessageRole,
  ToolCall,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  ChainEvent,
  ChainEventTypes,
  LatitudeChainCompletedEventData,
  LatitudeEventData,
} from '@latitude-data/constants'
import { StreamEventTypes } from '@latitude-data/core/browser'
import { LanguageModelUsage } from 'ai'
import { ParsedEvent } from 'eventsource-parser/stream'
import { useCallback, useRef, useState } from 'react'

function buildMessage({ input }: { input: string | ToolMessage[] }) {
  if (typeof input === 'string') {
    return [
      {
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: input }],
      } as Message,
    ]
  }
  return input
}

export type RunPromptFn = () => Promise<ReadableStream<ParsedEvent>>
export type AddMessagesFn = ({
  documentLogUuid,
  messages,
}: {
  documentLogUuid: string
  messages: Message[]
}) => Promise<ReadableStream<ParsedEvent>>

export function usePlaygroundChat({
  runPromptFn,
  addMessagesFn,
  onPromptRan,
}: {
  runPromptFn: RunPromptFn
  addMessagesFn?: AddMessagesFn
  onPromptRan?: (documentLogUuid?: string, error?: Error) => void
}) {
  const isChat = useRef(false)
  const [documentLogUuid, setDocumentLogUuid] = useState<string | undefined>()
  const [error, setError] = useState<Error | undefined>()
  const [streamingResponse, setStreamingResponse] = useState<
    string | undefined
  >()
  const [streamingReasoning, setStreamingReasoning] = useState<
    string | undefined
  >()
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [unresponedToolCalls, setUnresponedToolCalls] = useState<ToolCall[]>([])
  const [chainLength, setChainLength] = useState(Infinity)
  const [usage, setUsage] = useState<LanguageModelUsage>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  })
  const [time, setTime] = useState<number | undefined>()
  const [runningLatitudeTools, setRunningLatitudeTools] = useState<number>(0)
  const [wakingUpIntegration, setWakingUpIntegration] = useState<string>()

  const addMessages = useCallback(
    (m: Message[]) => {
      setMessages((prev) => [...prev, ...m])
    },
    [setMessages],
  )

  const handleStream = useCallback(
    async (
      stream: ReadableStream<ParsedEvent>,
      onPromptRan?: (documentLogUuid?: string, error?: Error) => void,
    ) => {
      setIsLoading(true)
      setError(undefined)
      const start = performance.now()
      let accumulatedTextDelta = ''
      let accumulatedReasoningDelta = ''
      let documentLogUuid: string | undefined

      const reader = stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue

          const parsedEvent = value as ParsedEvent
          if (parsedEvent.type !== 'event') continue

          const data = JSON.parse(parsedEvent.data) as ChainEvent['data']
          const { uuid } = data as LatitudeChainCompletedEventData

          if (uuid) {
            documentLogUuid = uuid
            setDocumentLogUuid(uuid)
          }

          if (data.type === ChainEventTypes.IntegrationWakingUp) {
            setWakingUpIntegration(data.integrationName)
          } else {
            setWakingUpIntegration(undefined)
          }

          // Delta text from the provider
          if (parsedEvent.event === StreamEventTypes.Provider) {
            if (data.type === 'text-delta') {
              accumulatedTextDelta += data.textDelta
              setStreamingResponse(accumulatedTextDelta)
            }
            if (data.type === 'reasoning') {
              accumulatedReasoningDelta += data.textDelta
              setStreamingReasoning(accumulatedReasoningDelta)
            }
            continue
          }

          if ((data as LatitudeEventData).messages) {
            setMessages((data as LatitudeEventData).messages)
          }

          if (data.type === ChainEventTypes.StepStarted) {
            accumulatedTextDelta = ''
            accumulatedReasoningDelta = ''
          }
          if (data.type === ChainEventTypes.ProviderCompleted) {
            accumulatedTextDelta = ''
            accumulatedReasoningDelta = ''
            setStreamingResponse(undefined)
            setStreamingReasoning(undefined)
            setUsage(data.tokenUsage)
          }

          if (data.type === ChainEventTypes.ToolsStarted) {
            setRunningLatitudeTools(data.tools.length)
          }
          if (data.type === ChainEventTypes.ToolCompleted) {
            setRunningLatitudeTools((prev) => prev - 1)
          }
          if (data.type === ChainEventTypes.StepCompleted) {
            setRunningLatitudeTools(0) // fallback
          }
          if (data.type === ChainEventTypes.ChainCompleted) {
            if (!isChat.current) {
              setChainLength(data.messages.length)
              setTime((prev) => (prev ?? 0) + (performance.now() - start))
            }
          }
          if (data.type === ChainEventTypes.ToolsRequested) {
            setUnresponedToolCalls(
              data.tools.filter((t) => t.name !== AGENT_RETURN_TOOL_NAME),
            )
          }

          if (data.type === ChainEventTypes.ChainError) {
            throw data.error
          }
        }
      } catch (error) {
        onPromptRan?.(documentLogUuid, error as Error)
        setError(error as Error)
      }

      setStreamingResponse(undefined)
      setStreamingReasoning(undefined)
      setIsLoading(false)
      onPromptRan?.(documentLogUuid)
    },
    [],
  )

  const submitUserMessage = useCallback(
    async (input: string | ToolMessage[]) => {
      if (!addMessagesFn) return
      if (!documentLogUuid) {
        // This should not happen
        setError(
          new Error('Tried to chat over a conversation that has not started'),
        )
        return
      }

      const newMessages = buildMessage({ input })

      if (typeof input === 'string') {
        // Only in Chat mode we add optimistically the message
        addMessages(newMessages)
        isChat.current = true
      } else {
        // Remove unresponded tool calls
        const respondedToolCallIds = newMessages.reduce((acc, message) => {
          if (message.role !== MessageRole.tool) return acc
          const toolResponseContents = message.content.filter(
            (c) => c.type === ContentType.toolResult,
          )
          return [...acc, ...toolResponseContents.map((c) => c.toolCallId)]
        }, [] as string[])
        setUnresponedToolCalls((prev) =>
          prev.filter((unrespondedToolCall) => {
            return !respondedToolCallIds.includes(unrespondedToolCall.id)
          }),
        )
      }

      if (!isChat.current) {
        setChainLength((prev) => prev + newMessages.length)
      }

      try {
        setIsLoading(true)

        const stream = await addMessagesFn({
          documentLogUuid,
          messages: newMessages,
        })

        await handleStream(stream)
      } catch (error) {
        setIsLoading(false)
        setError(error as Error)
      }
    },
    [addMessagesFn, documentLogUuid, handleStream, addMessages],
  )

  const start = useCallback(async () => {
    try {
      setIsLoading(true)
      const stream = await runPromptFn()
      handleStream(stream, onPromptRan)
    } catch (error) {
      setIsLoading(false)
      setError(error as Error)
      onPromptRan?.(undefined, error as Error)
    }
  }, [handleStream, runPromptFn, onPromptRan])

  return {
    start,
    submitUserMessage,
    addMessages: addMessagesFn ? addMessages : undefined,
    setError,
    error,
    streamingReasoning,
    streamingResponse,
    messages,
    wakingUpIntegration,
    runningLatitudeTools,
    chainLength,
    usage,
    time,
    unresponedToolCalls,
    isLoading,
  }
}
