import { ToolCallResponse as ToolResponse } from '@latitude-data/constants'
import {
  Message as PromptlMessage,
  ToolCallContent as ToolRequest,
  MessageRole as PromptlMessageRole,
} from 'promptl-ai'

export type PromptlVersion = 0 | 1
export type VersionedMessage = PromptlMessage

export type ToolPart = ToolRequest | Pick<ToolResponse, 'id'>

function extractPromptlToolContents(messages: PromptlMessage[]): ToolPart[] {
  return messages.flatMap<ToolPart>((message) => {
    if (message.role === PromptlMessageRole.tool) {
      return [{ id: message.toolId }]
    }

    if (message.role !== PromptlMessageRole.assistant) return []
    if (typeof message.content === 'string') return []

    const content = Array.isArray(message.content)
      ? message.content
      : [message.content]
    return content.filter((content) => {
      return content.type === 'tool-call'
    })
  })
}

export function extractToolContents({
  messages,
}: {
  messages: VersionedMessage[]
}) {
  return extractPromptlToolContents(messages as PromptlMessage[])
}

export type { ToolRequest }
