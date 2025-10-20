import { tokenizeText } from '$/lib/tokenize'
import { ChainEvent } from '@latitude-data/constants'
import {
  AssistantMessage,
  FileContent,
  ImageContent,
  Message,
  MessageContent,
  MessageRole,
  ToolCall,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { StreamEventTypes } from '@latitude-data/core/constants'
import { ParsedEvent } from 'eventsource-parser/stream'
import { omit } from 'lodash-es'
import React, { useCallback } from 'react'

type SetMessagesFunction = React.Dispatch<React.SetStateAction<Message[]>>
type SetUnrespondedToolCallsFunction = React.Dispatch<
  React.SetStateAction<ToolCall[]>
>
type SetRunningLatitudeToolsFunction = React.Dispatch<
  React.SetStateAction<number>
>
type AddMessagesFunction = (messages: Message[]) => void
type IncrementUsageDeltaFunction = (incr: {
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
}) => void

export function useProviderEventHandler({
  setMessages,
  setUnrespondedToolCalls,
  setRunningLatitudeTools,
  addMessages,
  incrementUsageDelta,
}: {
  setMessages: SetMessagesFunction
  setUnrespondedToolCalls: SetUnrespondedToolCallsFunction
  setRunningLatitudeTools: SetRunningLatitudeToolsFunction
  addMessages: AddMessagesFunction
  incrementUsageDelta: IncrementUsageDeltaFunction
}) {
  // Helper function to handle the step-start event
  const handleStepStart = useCallback(() => {
    addMessages([
      {
        role: MessageRole.assistant,
        toolCalls: [],
        content: [],
      },
    ])
  }, [addMessages])

  // Helper function to handle text-delta events
  const handleTextDelta = useCallback(
    (data: { type: 'text-delta'; textDelta: string }) => {
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

      incrementUsageDelta({ completionTokens: tokenizeText(data.textDelta) })
    },
    [setMessages, incrementUsageDelta],
  )

  const handleToolDelta = useCallback(
    (_data: { type: 'tool-input-delta' }) => {
      setMessages((messages) => {
        const lastMessage = messages.at(-1)

        // If the last message is not of assistant role, add a new assistant message
        if (!lastMessage || lastMessage.role !== MessageRole.assistant) {
          return [
            ...messages,
            {
              role: MessageRole.assistant,
              content: [],
              toolCalls: [],
              _isGeneratingToolCall: true,
            },
          ]
        }

        // Last message is of assistant role, update the content array
        return [
          ...messages.slice(0, -1),
          {
            ...lastMessage,
            _isGeneratingToolCall: true,
          },
        ]
      })
    },
    [setMessages],
  )

  // Helper function to handle tool-call events
  const handleToolCall = useCallback(
    (data: {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      _sourceData?: ToolSourceData
    }) => {
      if (data._sourceData?.source === ToolSource.Client) {
        setUnrespondedToolCalls((prev) => [
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
            ...omit(lastMessage, '_isGeneratingToolCall'),
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

      incrementUsageDelta({
        completionTokens: tokenizeText(
          data.toolName + JSON.stringify(data.args),
        ),
      })
    },
    [
      setMessages,
      setUnrespondedToolCalls,
      setRunningLatitudeTools,
      incrementUsageDelta,
    ],
  )

  // Helper function to handle tool-result events
  const handleToolResult = useCallback(
    (data: {
      type: 'tool-result'
      toolCallId: string
      toolName: string
      args: any
      result: any
    }) => {
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
    },
    [setMessages, setRunningLatitudeTools],
  )

  const handleReasoningDelta = useCallback(
    (data: { type: 'reasoning-delta'; text: string }) => {
      setMessages((messages) => {
        const lastMessage = messages.at(-1)!

        if (lastMessage.role === MessageRole.assistant) {
          const lastContent = (lastMessage.content as MessageContent[])?.at(-1)

          if (!lastContent) {
            return [
              ...messages.slice(0, -1),
              {
                ...lastMessage,
                content: [
                  ...((lastMessage.content as MessageContent[]) || []),
                  {
                    type: 'reasoning',
                    text: data.text,
                  },
                ],
              },
            ]
          } else if (lastContent.type !== 'reasoning') {
            return [
              ...messages.slice(0, -1),
              {
                ...lastMessage,
                content: [
                  ...((lastMessage.content as MessageContent[]) || []),
                  {
                    type: 'reasoning',
                    text: data.text,
                  },
                ],
              },
            ]
          } else {
            return [
              ...messages.slice(0, -1),
              {
                ...lastMessage,
                content: [
                  ...(lastMessage.content.slice(0, -1) as MessageContent[]),
                  {
                    ...lastContent,
                    text: (lastContent.text ?? '') + data.text,
                  },
                ],
              },
            ]
          }
        } else {
          return [
            ...messages,
            {
              role: MessageRole.assistant,
              toolCalls: [],
              content: [
                ...((lastMessage.content as MessageContent[]) || []),
                {
                  type: 'reasoning',
                  text: data.text,
                },
              ],
            },
          ]
        }
      })

      incrementUsageDelta({ reasoningTokens: tokenizeText(data.text) })
    },
    [setMessages, incrementUsageDelta],
  )

  const handleFile = useCallback(
    ({
      file: { mediaType, base64Data, base64, uint8Array },
    }: {
      type: 'file'
      file: {
        mediaType: string
        base64Data?: string
        base64?: string
        uint8Array?: Uint8Array
      }
    }) => {
      const mediaData = base64Data ?? base64 ?? uint8Array?.toString() ?? ''

      const content = mediaType?.startsWith('image/')
        ? ({
            type: 'image',
            image: mediaData,
          } as ImageContent)
        : ({
            type: 'file',
            file: mediaData,
            mimeType: mediaType,
          } as FileContent)

      setMessages((messages) => {
        const lastMessage = messages.at(-1)!
        if (lastMessage.role === MessageRole.assistant) {
          return [
            ...messages.slice(0, -1),
            {
              ...lastMessage,
              content: [...(lastMessage.content ?? []), content],
            } as AssistantMessage,
          ]
        } else {
          // Should not be possible
          throw new Error('Expected assistant message')
        }
      })

      incrementUsageDelta({
        completionTokens: tokenizeText(mediaData),
      })
    },
    [setMessages, incrementUsageDelta],
  )

  // Main handler that delegates to the appropriate helper based on event type
  const handleProviderEvent = useCallback(
    (parsedEvent: ParsedEvent, data: ChainEvent['data']) => {
      if (parsedEvent.event !== StreamEventTypes.Provider) return

      switch (data.type) {
        case 'start-step':
          handleStepStart()
          break
        case 'text-delta':
          handleTextDelta(data)
          break
        case 'tool-input-delta':
          handleToolDelta(data)
          break
        case 'tool-call':
          handleToolCall(data)
          break
        case 'tool-result':
          handleToolResult(data)
          break
        case 'reasoning-delta':
          handleReasoningDelta(data)
          break
        case 'reasoning-start':
          handleReasoningDelta({ type: 'reasoning-delta', text: '' })
          break
        case 'file':
          handleFile(data)
          break
      }
    },
    [
      handleStepStart,
      handleTextDelta,
      handleToolDelta,
      handleToolCall,
      handleToolResult,
      handleReasoningDelta,
      handleFile,
    ],
  )

  return { handleProviderEvent }
}
