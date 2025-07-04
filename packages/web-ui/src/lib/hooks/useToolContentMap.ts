'use client'

import {
  Message,
  MessageContent,
  MessageRole,
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { useMemo } from 'react'

export function useToolContentMap(
  messages: Message[],
  toolContentMap?: Record<string, ToolContent>,
) {
  return useMemo(() => {
    if (toolContentMap) return toolContentMap

    const res = messages.reduce((acc: Record<string, ToolContent>, message) => {
      if (![MessageRole.assistant, MessageRole.tool].includes(message.role)) {
        return acc
      }

      return Object.assign(
        acc,
        Object.fromEntries(
          (message.content as MessageContent[] | ToolRequestContent[])
            .filter((content) => content.type === 'tool-result')
            .map((content) => [content.toolCallId, content]),
        ),
      )
    }, {})

    return res
  }, [messages, toolContentMap])
}
