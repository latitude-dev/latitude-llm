import { tokenizeMessages, tokenizeText } from '$/lib/tokenize'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { useActiveRunsByDocument } from '$/stores/runs/activeRunsByDocument'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  ChainEvent,
  ChainEventTypes,
  EMPTY_USAGE,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
} from '@latitude-data/constants'
import {
  Message,
  MessageRole,
  ToolCall,
  ToolMessage,
} from '@latitude-data/constants/legacyCompiler'
import { estimateCost } from '@latitude-data/core/services/ai/estimateCost/index'
import { ParsedEvent } from 'eventsource-parser/stream'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProviderEventHandler } from './useProviderEventHandler'

type LanguageModelUsageDelta = Pick<
  LanguageModelUsage,
  'promptTokens' | 'completionTokens' | 'reasoningTokens'
>

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

export type RunPromptFn = (args: any) => Promise<ReadableStream<ParsedEvent>>
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
  abortCurrentStream,
  onPromptRan,
}: {
  runPromptFn: RunPromptFn
  addMessagesFn?: AddMessagesFn
  abortCurrentStream?: () => boolean
  onPromptRan?: (documentLogUuid?: string, error?: Error) => void
}) {
  const isChat = useRef(false)
  const [mode, setMode] = useState<'chat' | 'preview'>('preview')
  const [documentLogUuid, setDocumentLogUuid] = useState<string | undefined>()
  const [error, setError] = useState<Error | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [unrespondedToolCalls, setUnrespondedToolCalls] = useState<ToolCall[]>(
    [],
  )
  const [usage, setUsage] = useState<LanguageModelUsage>(EMPTY_USAGE())
  const [usageDelta, setUsageDelta] =
    useState<LanguageModelUsageDelta>(EMPTY_USAGE())
  const usageDeltaRef = useRef<LanguageModelUsageDelta>(EMPTY_USAGE())
  const [runningLatitudeTools, setRunningLatitudeTools] = useState<number>(0)
  const [wakingUpIntegration, setWakingUpIntegration] = useState<string>()
  const [provider, setProvider] = useState<string>()
  const [model, setModel] = useState<string>()
  const [duration, setDuration] = useState<number>(0)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const durationAccRef = useRef<number>(0)

  const { data: providers } = useProviderApiKeys()
  const cost = useMemo(() => {
    const p = providers?.find((p) => p.name === provider)
    const m = model || p?.defaultModel
    if (!p || !m) {
      return undefined
    }

    try {
      const estimatedCost = estimateCost({
        usage,
        provider: p.provider,
        model: m,
      })
      return Math.ceil(estimatedCost * 100_000)
    } catch {
      return undefined
    }
  }, [providers, provider, model, usage])

  const incrementUsage = useCallback(
    (incr: {
      promptTokens?: number
      completionTokens?: number
      reasoningTokens?: number
    }) =>
      setUsage((prev) => {
        const promptTokens = Math.max(0, Math.ceil(prev.promptTokens + (incr.promptTokens ?? 0))) // prettier-ignore
        const reasoningTokens = Math.max(0, Math.ceil(prev.reasoningTokens + (incr.reasoningTokens ?? 0))) // prettier-ignore
        const completionTokens = Math.max(0, Math.ceil(prev.completionTokens + (incr.completionTokens ?? 0))) // prettier-ignore
        const totalTokens = promptTokens + completionTokens + reasoningTokens
        return {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          promptTokens,
          completionTokens,
          totalTokens,
          reasoningTokens,
          cachedInputTokens: 0,
        }
      }),
    [setUsage],
  )

  const incrementUsageDelta = useCallback(
    (incr: {
      promptTokens?: number
      completionTokens?: number
      reasoningTokens?: number
    }) => {
      incrementUsage({
        promptTokens: incr.promptTokens,
        completionTokens: incr.completionTokens,
        reasoningTokens: incr.reasoningTokens,
      })
      setUsageDelta((prev) => {
        const promptTokens = Math.max(0, prev.promptTokens + (incr.promptTokens ?? 0)) // prettier-ignore
        const completionTokens = Math.max(0, prev.completionTokens + (incr.completionTokens ?? 0)) // prettier-ignore
        const reasoningTokens = Math.max(0, prev.reasoningTokens + (incr.reasoningTokens ?? 0)) // prettier-ignore
        return { promptTokens, completionTokens, reasoningTokens }
      })
    },
    [incrementUsage, setUsageDelta],
  )

  const resetUsageDelta = useCallback(() => {
    usageDeltaRef.current = EMPTY_USAGE()
    setUsageDelta(EMPTY_USAGE())
  }, [setUsageDelta])

  useEffect(() => {
    usageDeltaRef.current = usageDelta
  }, [usageDelta])

  const syncUsage = useCallback(
    (usage: LanguageModelUsage) => {
      incrementUsage({
        promptTokens: usage.promptTokens - usageDeltaRef.current.promptTokens,
        completionTokens:
          usage.completionTokens - usageDeltaRef.current.completionTokens,
        reasoningTokens:
          usage.reasoningTokens - usageDeltaRef.current.reasoningTokens,
      })
      resetUsageDelta()
    },
    [incrementUsage, resetUsageDelta],
  )

  const startTimer = useCallback(
    (startedAt?: number) => {
      if (startedAtRef.current) return
      startedAtRef.current = startedAt ?? Date.now()
      durationAccRef.current = duration
      timerRef.current = window.setInterval(() => {
        if (!startedAtRef.current) return
        const elapsed = Date.now() - startedAtRef.current
        setDuration(durationAccRef.current + elapsed)
      }, 100)
    },
    [duration],
  )

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
  }, [setDuration])

  // Note: cleaning up timer on unmount
  useEffect(() => resetTimer, [resetTimer])

  // Note: stopping timer when on pause
  useEffect(() => {
    if (!isLoading) stopTimer()
  }, [isLoading, stopTimer])

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
    setUnrespondedToolCalls,
    setRunningLatitudeTools,
    addMessages,
    incrementUsageDelta,
  })

  const handleLatitudeEvent = useCallback(
    (data: ChainEvent['data']) => {
      if (data.type === ChainEventTypes.ChainStarted) {
        startTimer(data.timestamp)
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
        // Note: for some reason some providers return an empty token usage,
        // so instead of showing 0 tokens, keep the approximation as is
        if (data.tokenUsage.totalTokens) syncUsage(data.tokenUsage)
      }

      if (data.type === ChainEventTypes.ToolsStarted) {
        setRunningLatitudeTools(data.tools.length)
      }

      if (data.type === ChainEventTypes.ToolResult) {
        incrementUsageDelta({
          promptTokens: tokenizeText(
            data.toolName + JSON.stringify(data.result),
          ),
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
    [
      setMessages,
      resetUsageDelta,
      incrementUsageDelta,
      syncUsage,
      setProvider,
      setModel,
      setRunningLatitudeTools,
      startTimer,
      stopTimer,
    ],
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

  /**
   * Ensures all streaming content blocks have isStreaming set to false.
   * This is called when a stream ends (either normally or via abort) to
   * clean up any content that might still be marked as streaming due to
   * race conditions or abrupt termination.
   */
  const cleanupStreamingState = useCallback(() => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (!Array.isArray(msg.content)) return msg
        const hasStreaming = msg.content.some(
          (c) => 'isStreaming' in c && c.isStreaming,
        )
        if (!hasStreaming) return msg
        return {
          ...msg,
          content: msg.content.map((c) =>
            'isStreaming' in c && c.isStreaming
              ? { ...c, isStreaming: false }
              : c,
          ),
        } as Message
      }),
    )
  }, [setMessages])

  const handleStream = useCallback(
    async ({
      stream,
      onPromptRan,
    }: {
      stream: ReadableStream<ParsedEvent>
      onPromptRan?: (documentLogUuid?: string, error?: Error) => void
    }) => {
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
        if (error instanceof Error && error.name === 'AbortError') {
          cleanupStreamingState()
          return
        }
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
      cleanupStreamingState,
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

        await handleStream({ stream })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        setError(error as Error)
      } finally {
        setIsLoading(false)
      }
    },
    [
      addMessagesFn,
      documentLogUuid,
      unrespondedToolCalls,
      handleStream,
      addMessages,
    ],
  )

  const start = useCallback(
    async (args: any = {}) => {
      try {
        setIsLoading(true)
        setMode('chat')
        const stream = await runPromptFn(args)
        handleStream({ stream, onPromptRan })
      } catch (error) {
        setIsLoading(false)
        setError(error as Error)
        onPromptRan?.(undefined, error as Error)
      }
    },
    [setMode, handleStream, runPromptFn, onPromptRan],
  )

  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { stopRun, isStoppingRun } = useActiveRunsByDocument({
    project,
    commit,
    document,
    realtime: false,
  })

  const stop = useCallback(async () => {
    if (!isLoading) return
    if (!documentLogUuid) return
    if (isStoppingRun) return

    if (isChat.current && abortCurrentStream) {
      abortCurrentStream()
      cleanupStreamingState()
    } else {
      await stopRun({ runUuid: documentLogUuid })
    }
  }, [
    isLoading,
    documentLogUuid,
    stopRun,
    isStoppingRun,
    abortCurrentStream,
    cleanupStreamingState,
  ])

  const reset = useCallback(() => {
    setMode('preview')
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
    isChat.current = false
  }, [
    setMode,
    setMessages,
    setUnrespondedToolCalls,
    setUsage,
    resetUsageDelta,
    setDocumentLogUuid,
    setError,
    setIsLoading,
    setWakingUpIntegration,
    setProvider,
    setModel,
    resetTimer,
  ])

  const isSubmitDisabled =
    isLoading || isStoppingRun || !!error || mode === 'preview'

  return useMemo(
    () => ({
      mode,
      addMessages: addMessagesFn ? addMessages : undefined,
      error,
      isLoading,
      isStopping: isStoppingRun,
      isSubmitDisabled,
      messages,
      runningLatitudeTools,
      start,
      stop,
      canStop: isLoading && !!documentLogUuid && !isStoppingRun,
      submitUserMessage,
      unrespondedToolCalls,
      usage,
      wakingUpIntegration,
      provider,
      model,
      duration,
      cost,
      reset,
    }),
    [
      mode,
      addMessages,
      addMessagesFn,
      error,
      isLoading,
      isStoppingRun,
      isSubmitDisabled,
      documentLogUuid,
      messages,
      runningLatitudeTools,
      start,
      stop,
      submitUserMessage,
      unrespondedToolCalls,
      usage,
      wakingUpIntegration,
      provider,
      model,
      duration,
      cost,
      reset,
    ],
  )
}

export type PlaygroundChat = ReturnType<typeof usePlaygroundChat>
