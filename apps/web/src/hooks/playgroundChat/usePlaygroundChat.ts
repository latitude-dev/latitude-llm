import {
  ChainEventDto,
  ChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/constants'
import { buildMessagesFromResponse } from '@latitude-data/core/browser'
import { PromptlVersion } from '@latitude-data/web-ui'
import { LanguageModelUsage } from 'ai'
import { readStreamableValue, StreamableValue } from 'ai/rsc'
import { useCallback, useRef, useState } from 'react'
import { useMessages } from './useMessages'
import {
  ContentType,
  MessageRole,
  ToolMessage,
  Message,
} from '@latitude-data/compiler'

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

export function usePlaygroundChat<V extends PromptlVersion>({
  runPromptFn,
  addMessagesFn,
  promptlVersion,
}: {
  runPromptFn: () => Promise<{
    stream: StreamableValue<{
      event: StreamEventTypes
      data: ChainEventDto
    }>
    documentLogUuid: Promise<string>
  }>
  addMessagesFn: ({
    documentLogUuid,
    messages,
  }: {
    documentLogUuid: string
    messages: Message[]
  }) => Promise<{
    stream: StreamableValue<{
      event: StreamEventTypes
      data: ChainEventDto
    }>
  }>
  promptlVersion: V
}) {
  const isChat = useRef(false)
  const [documentLogUuid, setDocumentLogUuid] = useState<string | undefined>()
  const [error, setError] = useState<Error | undefined>()
  const [streamingResponse, setStreamingResponse] = useState<
    string | undefined
  >()
  const [isLoading, setIsLoading] = useState(false)
  const { messages, addMessages, unresponedToolCalls } = useMessages<V>({
    version: promptlVersion,
  })
  const [chainLength, setChainLength] = useState(Infinity)
  const [usage, setUsage] = useState<LanguageModelUsage>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  })
  const [time, setTime] = useState<number | undefined>()

  const handleStream = useCallback(
    async (
      stream: StreamableValue<{
        event: StreamEventTypes
        data: ChainEventDto
      }>,
    ) => {
      setIsLoading(true)
      setError(undefined)
      const start = performance.now()
      let accumulatedTextDelta = ''
      let messagesCount = 0

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

          // Step started
          if (data.type === ChainEventTypes.Step) {
            setStreamingResponse('')
            addMessages(data.messages ?? [])
            messagesCount += data.messages?.length ?? 0
            accumulatedTextDelta = ''
          }

          // Step finished
          if (data.type === ChainEventTypes.StepComplete) {
            const responseMsgs = buildMessagesFromResponse(data)
            setStreamingResponse(undefined)
            addMessages(responseMsgs)
            messagesCount += responseMsgs.length
            accumulatedTextDelta = ''
          }

          // Chain finished
          if (data.type === ChainEventTypes.Complete) {
            if (!isChat.current) {
              setChainLength((prev) => prev + messagesCount)
              setTime((prev) => (prev ?? 0) + (performance.now() - start))
            }
            setUsage((prev) => ({
              promptTokens:
                (prev?.promptTokens ?? 0) + data.response.usage.promptTokens,
              completionTokens:
                (prev?.completionTokens ?? 0) +
                data.response.usage.completionTokens,
              totalTokens:
                (prev?.totalTokens ?? 0) + data.response.usage.totalTokens,
            }))
          }

          // Error
          if (data.type === ChainEventTypes.Error) {
            setError(new Error(data.error.message))
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

      // Only in Chat mode we add optimistically the message
      if (typeof input === 'string') {
        addMessages(newMessages)
        isChat.current = true
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
    [addMessages, addMessagesFn, documentLogUuid, handleStream],
  )

  const start = useCallback(async () => {
    try {
      setIsLoading(true)
      const { stream, documentLogUuid } = await runPromptFn()
      handleStream(stream)
      documentLogUuid.then((uuid) => setDocumentLogUuid(uuid))
    } catch (error) {
      setIsLoading(false)
      setError(error as Error)
    }
  }, [handleStream, runPromptFn])

  return {
    start,
    submitUserMessage,
    setError,
    addMessages,
    error,
    streamingResponse,
    messages,
    chainLength,
    usage,
    time,
    unresponedToolCalls,
    isLoading,
  }
}
