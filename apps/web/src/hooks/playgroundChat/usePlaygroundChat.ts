import {
  Message,
  MessageContent,
  MessageRole,
  ToolCall,
  ToolMessage,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import {
  AGENT_RETURN_TOOL_NAME,
  ChainEvent,
  ChainEventTypes,
} from '@latitude-data/constants'
import { StreamEventTypes } from '@latitude-data/core/browser'
import { LanguageModelUsage } from 'ai'
import { ParsedEvent } from 'eventsource-parser/stream'
import { useCallback, useMemo, useRef, useState } from 'react'

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

  const handleProviderEvent = useCallback(
    (parsedEvent: ParsedEvent, data: ChainEvent['data']) => {
      if (parsedEvent.event !== StreamEventTypes.Provider) return

      setMessages((messages) => {
        console.log('messages before: ', messages)
        return messages
      })

      console.log('provider event: ', data)

      if (data.type === 'step-start') {
        addMessages([
          {
            role: MessageRole.assistant,
            toolCalls: [],
            content: [],
          },
        ])
      } else if (data.type === 'text-delta') {
        setMessages((messages) => {
          const lastMessage = messages.at(-1)

          // If the last message is not of assistant role, add a new assistant message
          if (!lastMessage || lastMessage.role !== MessageRole.assistant) {
            return [
              ...messages,
              {
                role: MessageRole.assistant,
                content: [{ type: 'text', text: data.textDelta }],
                toolCalls: [],
              },
            ]
          }

          // Last message is of assistant role
          const lastContent = (lastMessage.content as MessageContent[])?.at(-1)

          // If the last content part is of text type, update it with appended text
          if (lastContent && lastContent.type === 'text') {
            const updatedContent = [
              ...(lastMessage.content as MessageContent[]).slice(0, -1),
              { ...lastContent, text: lastContent.text + data.textDelta },
            ]

            return [
              ...messages.slice(0, -1),
              {
                ...lastMessage,
                content: updatedContent,
              },
            ]
          }

          // If the last content part is not of text type, add a new text content part
          return [
            ...messages.slice(0, -1),
            {
              ...lastMessage,
              content: [
                ...((lastMessage.content as MessageContent[]) || []),
                { type: 'text', text: data.textDelta },
              ],
            },
          ]
        })
      } else if (data.type === 'tool-call') {
        if (!data.toolName.startsWith('lat_')) {
          setUnresponedToolCalls((prev) => [
            ...prev,
            {
              id: data.toolCallId,
              name: data.toolName,
              arguments: data.args,
            },
          ])
        } else {
          setRunningLatitudeTools((prev) => prev + 1)
        }

        setMessages((messages) => {
          const lastMessage = messages.at(-1)

          // If the last message is not of assistant role, add a new assistant message
          if (!lastMessage || lastMessage.role !== MessageRole.assistant) {
            return [
              ...messages,
              {
                role: MessageRole.assistant,
                content: [data],
                toolCalls: [
                  {
                    id: data.toolCallId,
                    name: data.toolName,
                    arguments: data.args,
                  },
                ],
              },
            ]
          }

          // Last message is of assistant role, update the toolCalls array and content
          return [
            ...messages.slice(0, -1),
            {
              ...lastMessage,
              content: [
                ...((lastMessage.content as MessageContent[]) || []),
                data,
              ],
              toolCalls: [
                ...(lastMessage.toolCalls || []),
                {
                  id: data.toolCallId,
                  name: data.toolName,
                  arguments: data.args,
                },
              ],
            },
          ]
        })
      } else if (data.type === 'tool-result') {
        setMessages((messages) => {
          const lastMessage = messages.at(-1)!
          if (lastMessage.role === MessageRole.assistant) {
            return [
              ...messages.slice(0, -1),
              {
                ...lastMessage,
                content: [
                  ...((lastMessage.content as
                    | MessageContent[]
                    | ToolRequestContent[]) ?? []),
                  data,
                ],
              },
            ]
          } else {
            // Should not be possible
            throw new Error('Expected assistant message')
          }
        })
        setRunningLatitudeTools((prev) => prev - 1)
      } else if (data.type === 'reasoning') {
        // TODO(compiler): review this
      }

      setMessages((messages) => {
        console.log('messages after: ', messages)
        return messages
      })
    },
    [addMessages, setRunningLatitudeTools],
  )

  const handleLatitudeEvent = useCallback(
    (data: ChainEvent['data']) => {
      if (data.type === ChainEventTypes.ProviderCompleted) {
        setUsage(data.tokenUsage)
      }

      if (data.type === ChainEventTypes.ToolsStarted) {
        setRunningLatitudeTools(data.tools.length)
      }

      if (data.type === ChainEventTypes.StepCompleted) {
        setRunningLatitudeTools(0)
      }

      if (data.type === ChainEventTypes.ToolsRequested) {
        setUnresponedToolCalls(
          data.tools.filter((t) => t.name !== AGENT_RETURN_TOOL_NAME),
        )
      }

      if (data.type === ChainEventTypes.ChainError) {
        throw data.error
      }
    },
    [setUsage, setRunningLatitudeTools, setUnresponedToolCalls],
  )

  const parseEvent = useCallback((value: ParsedEvent) => {
    const parsedEvent = value as ParsedEvent
    if (parsedEvent.type !== 'event') return { parsedEvent, data: undefined }

    const data = JSON.parse(parsedEvent.data) as ChainEvent['data']

    return { parsedEvent, data }
  }, [])

  const setDocumentLogUuidd = useCallback(
    (data: ChainEvent['data']) => {
      if ('uuid' in data) {
        setDocumentLogUuid(data.uuid)
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

      let documentLogUuid: string | undefined

      const reader = stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue

          const { parsedEvent, data } = parseEvent(value)
          if (!data) continue

          setDocumentLogUuidd(data)
          handleIntegrationEvent(data)
          handleProviderEvent(parsedEvent, data)
          handleLatitudeEvent(data)
        }
      } catch (error) {
        setError(error as Error)
      } finally {
        setIsLoading(false)
        onPromptRan?.(documentLogUuid, error)
      }
    },
    [
      error,
      setDocumentLogUuidd,
      handleIntegrationEvent,
      handleLatitudeEvent,
      handleProviderEvent,
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

  return useMemo(
    () => ({
      start,
      submitUserMessage,
      addMessages: addMessagesFn ? addMessages : undefined,
      error,
      messages,
      wakingUpIntegration,
      runningLatitudeTools,
      usage,
      unresponedToolCalls,
      isLoading,
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
    ],
  )
}
