'use client'

import {
  ContentType,
  Message as ConversationMessage,
  MessageRole,
  ToolContent,
  ToolMessage,
} from '@latitude-data/compiler'

import { Message } from '..'
import type { AgentToolsMap } from '@latitude-data/constants'
import { useToolContentMap } from '../../../../lib/hooks/useToolContentMap'

/**
 * Checks if the tool message has an existing tool request with the same ID.
 */
function isToolMessageResolved(
  message: ToolMessage,
  toolContentMap: Record<string, ToolContent>,
) {
  const toolResponses = message.content.filter(
    (content) => content.type === ContentType.toolResult,
  )

  return toolResponses.every(
    (toolResponse) => toolResponse.toolCallId in toolContentMap,
  )
}

export function MessageList({
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
}) {
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
}
