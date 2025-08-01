import { ChainEvent, ChainEventTypes } from '@latitude-data/constants'
import {
  Message,
  MessageRole,
  ToolCall,
  ToolMessage,
} from '@latitude-data/constants/legacyCompiler'
import { LanguageModelUsage } from 'ai'
import { ParsedEvent } from 'eventsource-parser/stream'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useProviderEventHandler } from './useProviderEventHandler'

function buildMessage({ input }: { input: string | ToolMessage[] }) {
  if (typeof input === 'string') {
    return [
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: input }],
      } as Message,
    ]
  }
  return input
}

export type RunPromptFn = () => Promise<ReadableStream<ParsedEvent>>
export type AddMessagesFn = ({
  documentLogUuid,
  messages,
  toolCalls,
}: {
  documentLogUuid: string
  messages: Message[]
  toolCalls?: ToolCall[]
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
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [unresponedToolCalls, setUnresponedToolCalls] = useState<ToolCall[]>([])
  const [usage, setUsage] = useState<LanguageModelUsage>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  })
  const [runningLatitudeTools, setRunningLatitudeTools] = useState<number>(0)
  const [wakingUpIntegration, setWakingUpIntegration] = useState<string>()

  const addMessages = useCallback(
    (m: Message[]) => {
      setMessages((prev) => [...prev, ...m])
    },
    [setMessages],
  )

  const handleIntegrationEvent = useCallback(
    (data: ChainEvent['data']) => {
      if (data.type === ChainEventTypes.IntegrationWakingUp) {
        setWakingUpIntegration(data.integrationName)
      } else {
        setWakingUpIntegration(undefined)
      }
    },
    [setWakingUpIntegration],
  )

  // Use the provider event handler hook
  const { handleProviderEvent } = useProviderEventHandler({
    setMessages,
    setUnresponedToolCalls,
    setRunningLatitudeTools,
    addMessages,
  })

  const handleLatitudeEvent = useCallback(
    (data: ChainEvent['data']) => {
      if (data.type === ChainEventTypes.StepStarted) {
        setMessages(data.messages)
      }
      if (data.type === ChainEventTypes.ProviderCompleted) {
        setUsage(data.tokenUsage)
      }

      if (data.type === ChainEventTypes.ToolsStarted) {
        setRunningLatitudeTools(data.tools.length)
      }

      if (data.type === ChainEventTypes.StepCompleted) {
        setRunningLatitudeTools(0)
      }

      if (data.type === ChainEventTypes.ChainError) {
        throw data.error
      }
    },
    [setUsage, setRunningLatitudeTools],
  )

  const handleGenericStreamError = useCallback(
    (parsedEvent: ParsedEvent, data: Error) => {
      if (parsedEvent.event !== 'error') return

      setError(data)
    },
    [setError],
  )

  const parseEvent = useCallback((value: ParsedEvent) => {
    const parsedEvent = value as ParsedEvent
    if (parsedEvent.type !== 'event') return { parsedEvent, data: undefined }

    const data = JSON.parse(parsedEvent.data) as ChainEvent['data'] | Error

    return { parsedEvent, data }
  }, [])

  const setDocumentLogUuidd = useCallback(
    (data: ChainEvent['data']) => {
      if ('uuid' in data) {
        setDocumentLogUuid(data.uuid)
        return data.uuid
      }
    },
    [setDocumentLogUuid],
  )

  const handleStream = useCallback(
    async (
      stream: ReadableStream<ParsedEvent>,
      onPromptRan?: (documentLogUuid?: string, error?: Error) => void,
    ) => {
      setIsLoading(true)
      setError(undefined)

      let runUuid: string | undefined
      let runError: Error | undefined

      const reader = stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue

          const { parsedEvent, data } = parseEvent(value)
          if (!data) continue

          runUuid = setDocumentLogUuidd(data as ChainEvent['data']) ?? runUuid
          handleIntegrationEvent(data as ChainEvent['data'])
          handleLatitudeEvent(data as ChainEvent['data'])
          handleProviderEvent(parsedEvent, data as ChainEvent['data'])
          handleGenericStreamError(parsedEvent, data as Error)
        }
      } catch (error) {
        setError(error as Error)
        runError = error as Error
      } finally {
        setIsLoading(false)
        onPromptRan?.(runUuid, runError)
      }
    },
    [
      setDocumentLogUuidd,
      handleIntegrationEvent,
      handleLatitudeEvent,
      handleProviderEvent,
      handleGenericStreamError,
      parseEvent,
      setError,
      setIsLoading,
    ],
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
      let respondedToolCalls: ToolCall[] = []

      if (typeof input === 'string') {
        // Only in Chat mode we add optimistically the message
        addMessages(newMessages)
        isChat.current = true
      } else {
        // Remove unresponded tool calls
        const respondedToolCallIds = newMessages.reduce((acc, message) => {
          if (message.role !== MessageRole.tool) return acc
          const toolResponseContents = message.content.filter(
            (c) => c.type === 'tool-result',
          )
          return [...acc, ...toolResponseContents.map((c) => c.toolCallId)]
        }, [] as string[])
        respondedToolCalls = unresponedToolCalls.filter((toolCall) => {
          return respondedToolCallIds.includes(toolCall.id)
        })
        setUnresponedToolCalls((prev) =>
          prev.filter((unrespondedToolCall) => {
            return !respondedToolCallIds.includes(unrespondedToolCall.id)
          }),
        )
      }

      try {
        setIsLoading(true)

        const stream = await addMessagesFn({
          documentLogUuid,
          messages: newMessages,
          toolCalls: respondedToolCalls,
        })

        await handleStream(stream)
      } catch (error) {
        setIsLoading(false)
        setError(error as Error)
      }
    },
    [
      addMessagesFn,
      documentLogUuid,
      unresponedToolCalls,
      handleStream,
      addMessages,
    ],
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

  const reset = useCallback(() => {
    setMessages([])
    setUnresponedToolCalls([])
    setUsage({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    })
    setDocumentLogUuid(undefined)
    setError(undefined)
    setIsLoading(false)
    setWakingUpIntegration(undefined)
  }, [
    setMessages,
    setUnresponedToolCalls,
    setUsage,
    setDocumentLogUuid,
    setError,
    setIsLoading,
    setWakingUpIntegration,
  ])

  return useMemo(
    () => ({
      addMessages: addMessagesFn ? addMessages : undefined,
      error,
      isLoading,
      messages,
      runningLatitudeTools,
      start,
      submitUserMessage,
      unresponedToolCalls,
      usage,
      wakingUpIntegration,
      reset,
    }),
    [
      addMessages,
      addMessagesFn,
      error,
      isLoading,
      messages,
      runningLatitudeTools,
      start,
      submitUserMessage,
      unresponedToolCalls,
      usage,
      wakingUpIntegration,
      reset,
    ],
  )
}
