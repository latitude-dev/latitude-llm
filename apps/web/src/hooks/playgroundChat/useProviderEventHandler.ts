import { tokenizeText } from '$/lib/tokenize'
import { ChainEvent } from '@latitude-data/constants'
import {
  AssistantMessage,
  FileContent,
  ImageContent,
  Message,
  MessageContent,
  MessageRole,
  ReasoningContent,
  ToolCall,
  ToolRequestContent,
} from '@latitude-data/constants/messages'
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

// TODO: Refactor this handler completely. Too long and complex. Each sub-handler should have its dedicated file and test.
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

  const handleReasoning = useCallback(
    ({
      type,
      id,
      text,
    }: {
      type: 'reasoning-delta' | 'reasoning-start' | 'reasoning-end'
      id: string
      text?: string
    }) => {
      // Account for token usage only on deltas (unchanged behavior)
      if (text && type === 'reasoning-delta') {
        incrementUsageDelta({ reasoningTokens: tokenizeText(text) })
      }

      setMessages((prev) => {
        if (!prev.length) {
          // Nothing to attach to; safest is to no-op unless we want to create a new message.
          return prev
        }

        const isEnd = type === 'reasoning-end'
        const deltaText = text ?? ''

        // Find the message & content index containing the reasoning block with this id.
        let msgIdx = -1
        let contentIdx = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          const c = prev[i].content
          if (Array.isArray(c)) {
            const idx = c.findIndex(
              (item) => item.type === 'reasoning' && (item as any).id === id,
            )
            if (idx !== -1) {
              msgIdx = i
              contentIdx = idx
              break
            }
          }
        }

        // If not found:
        if (msgIdx === -1 || contentIdx === -1) {
          // If this is an END without a known block, ignore gracefully.
          if (isEnd) return prev

          const last = prev[prev.length - 1]
          if (!Array.isArray(last.content)) {
            // Can't append a structured block to a string content; skip to avoid corruption.
            return prev
          }

          const next = [...prev]
          const nextLast = {
            ...last,
            content: [
              ...last.content,
              {
                type: 'reasoning',
                id,
                text: deltaText || undefined,
                isStreaming: !isEnd,
              },
            ],
          } as Message
          next[next.length - 1] = nextLast
          return next
        }

        // Found an existing reasoning block: immutably update
        const next = [...prev]
        const msg = next[msgIdx]
        if (!Array.isArray(msg.content)) {
          // Defensive: shouldn't happen because we found contentIdx above
          return prev
        }
        const contents = [...msg.content]
        const existing = contents[contentIdx] as ReasoningContent

        contents[contentIdx] = {
          ...existing,
          text: (existing.text ?? '') + deltaText,
          isStreaming: !isEnd,
        }

        next[msgIdx] = { ...msg, content: contents } as Message
        return next
      })
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
        case 'reasoning-start':
        case 'reasoning-delta':
        case 'reasoning-end':
          handleReasoning(data)
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
      handleReasoning,
      handleFile,
    ],
  )

  return { handleProviderEvent }
}
