'use client'

import {
  Message as ConversationMessage,
  MessageRole,
  ToolContent,
  ToolMessage,
} from '@latitude-data/constants/legacyCompiler'

import { memo, useMemo } from 'react'
import { Message } from '..'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'

/**
 * Checks if the tool message has an existing tool request with the same ID.
 */
function isToolMessageResolved(
  message: ToolMessage,
  toolContentMap: Record<string, ToolContent>,
) {
  const toolResponses = message.content.filter(
    (content) => content.type === 'tool-result',
  )

  return toolResponses.every(
    (toolResponse) => toolResponse.toolCallId in toolContentMap,
  )
}

export const MessageList = memo(
  ({
    messages,
    parameters,
    debugMode,
    toolContentMap: _toolContentMap,
  }: {
    messages: ConversationMessage[]
    parameters?: string[]
    debugMode?: boolean
    toolContentMap?: Record<string, ToolContent>
  }) => {
    const toolContentMap = useToolContentMap(messages, _toolContentMap)
    const displayableMessages = useMemo(
      () =>
        messages.filter((message) => {
          if (
            toolContentMap &&
            message.role === MessageRole.tool &&
            isToolMessageResolved(message, toolContentMap)
          ) {
            // If a tool message comes from an existing tool request, we won't render the tool
            // message here, since the response will be rendered in the tool request itself.
            return false
          }
          return true
        }),
      [messages, toolContentMap],
    )

    return (
      <div className='flex flex-col'>
        {displayableMessages.map((message, index) => {
          return (
            <Message
              key={index}
              role={message.role}
              content={message.content}
              parameters={parameters}
              debugMode={debugMode}
              toolContentMap={toolContentMap}
              isGeneratingToolCall={
                message.role === MessageRole.assistant &&
                message._isGeneratingToolCall
              }
              additionalAssistantMessage={
                // If this is an additional assistant message, added to a previous assistant message
                index > 0 &&
                message.role === MessageRole.assistant &&
                messages[index - 1].role === MessageRole.assistant
              }
            />
          )
        })}
      </div>
    )
  },
)

export function MessageListSkeleton({ messages = 3 }: { messages?: number }) {
  return (
    <div className='w-full flex flex-col gap-4'>
      {Array.from({ length: messages }).map((_, index) => (
        <div key={index} className='flex flex-col gap-1 w-full items-start'>
          <div>
            <Skeleton className='w-14 h-4' />
          </div>
          <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
            <div className='flex-shrink-0 bg-muted w-1 rounded-lg' />
            <div className='flex flex-grow flex-col gap-1 overflow-x-auto py-1'>
              <Skeleton className='w-full h-20' />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
