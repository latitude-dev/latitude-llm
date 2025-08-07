import { tokenizeMessages, tokenizeText } from '$/lib/tokenize'
import { type ChainEvent, ChainEventTypes } from '@latitude-data/constants'
import {
  type Message,
  MessageRole,
  type ToolCall,
  type ToolMessage,
} from '@latitude-data/constants/legacyCompiler'
import type { LanguageModelUsage } from 'ai'
import type { ParsedEvent } from 'eventsource-parser/stream'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProviderEventHandler } from './useProviderEventHandler'

const EMPTY_USAGE = (): LanguageModelUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
})

type LanguageModelUsageDelta = Pick<LanguageModelUsage, 'promptTokens' | 'completionTokens'>

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
  const [unrespondedToolCalls, setUnrespondedToolCalls] = useState<ToolCall[]>([]) // prettier-ignore
  const [usage, setUsage] = useState<LanguageModelUsage>(EMPTY_USAGE())
  const [usageDelta, setUsageDelta] = useState<LanguageModelUsageDelta>(EMPTY_USAGE()) // prettier-ignore
  const usageDeltaRef = useRef<LanguageModelUsageDelta>(EMPTY_USAGE())
  const [runningLatitudeTools, setRunningLatitudeTools] = useState<number>(0)
  const [wakingUpIntegration, setWakingUpIntegration] = useState<string>()
  const [provider, setProvider] = useState<string>()
  const [model, setModel] = useState<string>()
  const [duration, setDuration] = useState<number>(0)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const durationAccRef = useRef<number>(0)

  const incrementUsage = useCallback(
    (incr: { promptTokens?: number; completionTokens?: number }) =>
      setUsage((prev) => {
        const promptTokens = Math.ceil(prev.promptTokens + (incr.promptTokens ?? 0))
        const completionTokens = Math.ceil(prev.completionTokens + (incr.completionTokens ?? 0))
        const totalTokens = promptTokens + completionTokens

        return { promptTokens, completionTokens, totalTokens }
      }),
    [],
  )

  const incrementUsageDelta = useCallback(
    (incr: { promptTokens?: number; completionTokens?: number }) => {
      incrementUsage({
        promptTokens: incr.promptTokens,
        completionTokens: incr.completionTokens,
      })
      setUsageDelta((prev) => {
        const promptTokens = prev.promptTokens + (incr.promptTokens ?? 0)
        const completionTokens = prev.completionTokens + (incr.completionTokens ?? 0) // prettier-ignore
        return { promptTokens, completionTokens }
      })
    },
    [incrementUsage],
  )

  const resetUsageDelta = useCallback(() => {
    usageDeltaRef.current = EMPTY_USAGE()
    setUsageDelta(EMPTY_USAGE())
  }, [])

  useEffect(() => {
    usageDeltaRef.current = usageDelta
  }, [usageDelta])

  const syncUsage = useCallback(
    (usage: LanguageModelUsage) => {
      incrementUsage({
        promptTokens: usage.promptTokens - usageDeltaRef.current.promptTokens,
        completionTokens: usage.completionTokens - usageDeltaRef.current.completionTokens,
      })
      resetUsageDelta()
    },
    [incrementUsage, resetUsageDelta],
  )

  const startTimer = useCallback(() => {
    if (startedAtRef.current) return
    startedAtRef.current = Date.now()
    durationAccRef.current = duration
    timerRef.current = window.setInterval(() => {
      if (!startedAtRef.current) return
      const elapsed = Date.now() - startedAtRef.current
      setDuration(durationAccRef.current + elapsed)
    }, 100)
  }, [duration])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
    }
    timerRef.current = null
    startedAtRef.current = null
  }, [])

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
    }
    timerRef.current = null
    startedAtRef.current = null
    durationAccRef.current = 0
    setDuration(0)
  }, [])

  // Note: cleaning up timer on unmount
  useEffect(() => resetTimer, [resetTimer])

  // Note: stopping timer when on pause
  useEffect(() => {
    if (!isLoading) stopTimer()
  }, [isLoading, stopTimer])

  const addMessages = useCallback((m: Message[]) => {
    setMessages((prev) => [...prev, ...m])
  }, [])

  const handleIntegrationEvent = useCallback((data: ChainEvent['data']) => {
    if (data.type === ChainEventTypes.IntegrationWakingUp) {
      setWakingUpIntegration(data.integrationName)
    } else {
      setWakingUpIntegration(undefined)
    }
  }, [])

  // Use the provider event handler hook
  const { handleProviderEvent } = useProviderEventHandler({
    setMessages,
    setUnrespondedToolCalls,
    setRunningLatitudeTools,
    addMessages,
    incrementUsageDelta,
  })

  const handleLatitudeEvent = useCallback(
    (data: ChainEvent['data']) => {
      if (data.type === ChainEventTypes.ChainStarted) {
        startTimer()
        resetUsageDelta()
      }

      if (data.type === ChainEventTypes.StepStarted) {
        setMessages(data.messages)
        incrementUsageDelta({
          promptTokens: tokenizeMessages(data.messages),
        })
      }

      if (data.type === ChainEventTypes.ProviderStarted) {
        setProvider(data.config?.provider as string)
        setModel(data.config?.model as string)
      }

      if (data.type === ChainEventTypes.ProviderCompleted) {
        syncUsage(data.tokenUsage)
      }

      if (data.type === ChainEventTypes.ToolsStarted) {
        setRunningLatitudeTools(data.tools.length)
      }

      if (data.type === ChainEventTypes.ToolResult) {
        incrementUsageDelta({
          promptTokens: tokenizeText(data.toolName + JSON.stringify(data.result)),
        })
      }

      if (data.type === ChainEventTypes.StepCompleted) {
        setRunningLatitudeTools(0)
      }

      if (data.type === ChainEventTypes.ChainCompleted) {
        resetUsageDelta()
        stopTimer()
      }

      if (data.type === ChainEventTypes.ChainError) {
        resetUsageDelta()
        stopTimer()
        throw data.error
      }
    },
    [resetUsageDelta, incrementUsageDelta, syncUsage, startTimer, stopTimer],
  )

  const handleGenericStreamError = useCallback((parsedEvent: ParsedEvent, data: Error) => {
    if (parsedEvent.event !== 'error') return

    setError(data)
  }, [])

  const parseEvent = useCallback((value: ParsedEvent) => {
    const parsedEvent = value as ParsedEvent
    if (parsedEvent.type !== 'event') return { parsedEvent, data: undefined }

    const data = JSON.parse(parsedEvent.data) as ChainEvent['data'] | Error

    return { parsedEvent, data }
  }, [])

  const setDocumentLogUuidd = useCallback((data: ChainEvent['data']) => {
    if ('uuid' in data) {
      setDocumentLogUuid(data.uuid)
      return data.uuid
    }
  }, [])

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
    ],
  )

  const submitUserMessage = useCallback(
    async (input: string | ToolMessage[]) => {
      if (!addMessagesFn) return
      if (!documentLogUuid) {
        // This should not happen
        setError(new Error('Tried to chat over a conversation that has not started'))
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
          const toolResponseContents = message.content.filter((c) => c.type === 'tool-result')
          return [...acc, ...toolResponseContents.map((c) => c.toolCallId)]
        }, [] as string[])
        respondedToolCalls = unrespondedToolCalls.filter((toolCall) => {
          return respondedToolCallIds.includes(toolCall.id)
        })
        setUnrespondedToolCalls((prev) =>
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
    [addMessagesFn, documentLogUuid, unrespondedToolCalls, handleStream, addMessages],
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
    setUnrespondedToolCalls([])
    setUsage(EMPTY_USAGE())
    resetUsageDelta()
    setDocumentLogUuid(undefined)
    setError(undefined)
    setIsLoading(false)
    setWakingUpIntegration(undefined)
    setProvider(undefined)
    setModel(undefined)
    resetTimer()
  }, [resetUsageDelta, resetTimer])

  return useMemo(
    () => ({
      addMessages: addMessagesFn ? addMessages : undefined,
      error,
      isLoading,
      messages,
      runningLatitudeTools,
      start,
      submitUserMessage,
      unrespondedToolCalls,
      usage,
      wakingUpIntegration,
      provider,
      model,
      duration,
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
      unrespondedToolCalls,
      usage,
      wakingUpIntegration,
      provider,
      model,
      duration,
      reset,
    ],
  )
}
