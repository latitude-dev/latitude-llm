'use client'

import { ToolResultPayload } from '@latitude-data/constants/ai'
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
            .map((content) => [
              content.toolCallId,
              transformContent(content as ToolContent),
            ]),
        ),
      )
    }, {})

    return res
  }, [messages, toolContentMap])
}

/**
 * Transforms tool content by normalizing the result format and extracting error state.
 *
 * This function handles different result formats:
 * - ToolResultPayload objects: Extracts the value and isError properties
 * - Other formats: Returns content unchanged
 *
 * @param content - The tool content to transform
 * @returns The transformed tool content with normalized result and error state
 */
function transformContent(content: ToolContent): ToolContent {
  const result = content.result
  if (
    'value' in (result as ToolResultPayload) &&
    'isError' in (result as ToolResultPayload)
  ) {
    return {
      ...content,
      result: (result as ToolResultPayload).value,
      isError: (result as ToolResultPayload).isError,
    }
  } else {
    return content
  }
}
