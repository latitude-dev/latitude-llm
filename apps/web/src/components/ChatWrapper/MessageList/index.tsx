'use client'

import {
  Message as ConversationMessage,
  MessageRole,
  ToolContent,
  ToolMessage,
} from '@latitude-data/constants/legacyCompiler'

import type { AgentToolsMap } from '@latitude-data/constants'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import { memo } from 'react'
import { Message } from '..'

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
    collapseParameters,
    agentToolsMap,
    toolContentMap: _toolContentMap,
  }: {
    messages: ConversationMessage[]
    parameters?: string[]
    collapseParameters?: boolean
    agentToolsMap?: AgentToolsMap
    toolContentMap?: Record<string, ToolContent>
  }) => {
    const toolContentMap = useToolContentMap(messages, _toolContentMap)

    return (
      <div className='flex flex-col gap-4'>
        {messages.map((message, index) => {
          if (
            toolContentMap &&
            message.role === MessageRole.tool &&
            isToolMessageResolved(message, toolContentMap)
          ) {
            // If a tool message comes from an existing tool request, we won't render the tool
            // message here, since the response will be rendered in the tool request itself.
            return null
          }

          return (
            <Message
              key={index}
              role={message.role}
              content={message.content}
              parameters={parameters}
              collapseParameters={collapseParameters}
              agentToolsMap={agentToolsMap}
              toolContentMap={toolContentMap}
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
