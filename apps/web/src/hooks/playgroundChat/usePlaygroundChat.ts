import { StreamEventTypes } from '@latitude-data/core/browser'
import { LanguageModelUsage } from 'ai'
import { readStreamableValue, StreamableValue } from 'ai/rsc'
import { useCallback, useRef, useState } from 'react'
import {
  ContentType,
  MessageRole,
  ToolMessage,
  Message,
  ToolCall,
} from '@latitude-data/compiler'
import { ChainEvent, ChainEventTypes } from '@latitude-data/constants'

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

export function usePlaygroundChat({
  runPromptFn,
  addMessagesFn,
  onPromptRan,
}: {
  runPromptFn: () => Promise<{
    stream: StreamableValue<ChainEvent>
    documentLogUuid: Promise<string>
  }>
  addMessagesFn: ({
    documentLogUuid,
    messages,
  }: {
    documentLogUuid: string
    messages: Message[]
  }) => Promise<{
    stream: StreamableValue<ChainEvent>
  }>
  onPromptRan?: (documentLogUuid?: string, error?: Error) => void
}) {
  const isChat = useRef(false)
  const [documentLogUuid, setDocumentLogUuid] = useState<string | undefined>()
  const [error, setError] = useState<Error | undefined>()
  const [streamingResponse, setStreamingResponse] = useState<
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

  const addMessages = useCallback(
    (m: Message[]) => {
      setMessages((prev) => [...prev, ...m])
    },
    [setMessages],
  )

  const handleStream = useCallback(
    async (stream: StreamableValue<ChainEvent>) => {
      setIsLoading(true)
      setError(undefined)
      const start = performance.now()
      let accumulatedTextDelta = ''

      try {
        for await (const serverEvent of readStreamableValue(stream)) {
          if (!serverEvent) continue

          const { event, data } = serverEvent

          // Delta text from the provider
          if (event === StreamEventTypes.Provider) {
            if (data.type === 'text-delta') {
              accumulatedTextDelta += data.textDelta
              setStreamingResponse(accumulatedTextDelta)
            }
            continue
          }

          setMessages(data.messages)

          if (data.type === ChainEventTypes.StepStarted) {
            accumulatedTextDelta = ''
          }
          if (data.type === ChainEventTypes.ProviderCompleted) {
            accumulatedTextDelta = ''
            setStreamingResponse(undefined)
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
            setUnresponedToolCalls(data.tools)
          }
        }
      } catch (error) {
        setError(error as Error)
      }

      setStreamingResponse(undefined)
      setIsLoading(false)
    },
    [],
  )

  const submitUserMessage = useCallback(
    async (input: string | ToolMessage[]) => {
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
        const { stream } = await addMessagesFn({
          documentLogUuid,
          messages: newMessages,
        })

        await handleStream(stream)
      } catch (error) {
        setIsLoading(false)
        setError(error as Error)
      }
    },
    [addMessagesFn, documentLogUuid, handleStream],
  )

  const start = useCallback(async () => {
    try {
      setIsLoading(true)
      const { stream, documentLogUuid } = await runPromptFn()
      handleStream(stream)
      const uuid = await documentLogUuid
      setDocumentLogUuid(uuid)
      onPromptRan?.(uuid, error)
    } catch (error) {
      setIsLoading(false)
      setError(error as Error)
      onPromptRan?.(undefined, error as Error)
    }
  }, [handleStream, runPromptFn, onPromptRan])

  return {
    start,
    submitUserMessage,
    addMessages,
    setError,
    error,
    streamingResponse,
    messages,
    runningLatitudeTools,
    chainLength,
    usage,
    time,
    unresponedToolCalls,
    isLoading,
  }
}
