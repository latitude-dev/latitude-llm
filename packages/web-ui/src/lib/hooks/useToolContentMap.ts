'use client'

import { ToolResultPayload } from '@latitude-data/constants/ai'
import {
  Message,
  MessageContent,
  ToolResultContent,
} from '@latitude-data/constants/messages'
import { useMemo } from 'react'

export function useToolContentMap(
  messages: Message[],
  toolContentMap?: Record<string, ToolResultContent>,
) {
  return useMemo(() => {
    if (toolContentMap) return toolContentMap

    const res = messages.reduce(
      (acc: Record<string, ToolResultContent>, message) => {
        if (typeof message.content === 'string') return acc
        if (message.role !== 'assistant' && message.role !== 'tool') return acc

        return Object.assign(
          acc,
          Object.fromEntries(
            (message.content as MessageContent[])
              .filter((content) => content.type === 'tool-result')
              .map((content) => [
                content.toolCallId,
                transformContent(content as ToolResultContent),
              ]),
          ),
        )
      },
      {},
    )

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
function transformContent(content: ToolResultContent): ToolResultContent {
  const result = content.result
  if (
    result &&
    typeof result === 'object' &&
    'value' in result &&
    'isError' in result
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
