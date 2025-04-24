'use client'
import {
  ContentType,
  Message,
  MessageRole,
  ToolContent,
} from '@latitude-data/compiler'
import { useMemo } from 'react'

export function useToolContentMap(
  messages: Message[],
  toolContentMap?: Record<string, ToolContent>,
) {
  return useMemo(() => {
    if (toolContentMap) return toolContentMap

    return messages.reduce((acc: Record<string, ToolContent>, message) => {
      if (message.role !== MessageRole.tool) return acc
      return Object.assign(
        acc,
        Object.fromEntries(
          message.content
            .filter((content) => content.type === ContentType.toolResult)
            .map((content) => [content.toolCallId, content]),
        ),
      )
    }, {})
  }, [messages, toolContentMap])
}
