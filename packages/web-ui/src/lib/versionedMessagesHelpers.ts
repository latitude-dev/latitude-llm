import {
  Message as CompilerMessage,
  ContentType as CompilerContentType,
  MessageRole as CompilerMessageRole,
  ToolRequestContent as CompilerToolRequestContent,
} from '@latitude-data/compiler'
import { ToolCallResponse as ToolResponse } from '@latitude-data/constants'
import {
  Message as PromptlMessage,
  ToolCallContent as ToolRequest,
  ContentType as PromptlContentType,
  MessageRole as PromptlMessageRole,
} from 'promptl-ai'

export type PromptlVersion = 0 | 1
export type VersionedMessage<V extends PromptlVersion> = V extends 0
  ? CompilerMessage
  : PromptlMessage
type ToolResponsePart = Pick<ToolResponse, 'id'>

export type ToolPart = ToolRequest | ToolResponsePart

function extractCompilerToolContents(messages: CompilerMessage[]): ToolPart[] {
  return messages.flatMap<ToolPart>((message) => {
    if (message.role === CompilerMessageRole.tool) {
      return message.content
        .filter((content) => {
          return content.type === CompilerContentType.toolResult
        })
        .map((content) => ({
          id: content.toolCallId,
        }))
    }

    if (message.role !== CompilerMessageRole.assistant) return []
    if (typeof message.content === 'string') return []

    const content = Array.isArray(message.content)
      ? message.content
      : [message.content]

    const toolRequestContents = content.filter((content) => {
      return content.type === CompilerContentType.toolCall
    }) as CompilerToolRequestContent[]

    return toolRequestContents.map((content) => ({
      type: PromptlContentType.toolCall,
      toolCallId: content.toolCallId,
      toolName: content.toolName,
      toolArguments: content.args,
    }))
  })
}

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
      return content.type === PromptlContentType.toolCall
    })
  })
}

export function extractToolContents<V extends PromptlVersion>({
  version,
  messages,
}: {
  version: V
  messages: VersionedMessage<V>[]
}) {
  return version === 0
    ? extractCompilerToolContents(messages as CompilerMessage[])
    : extractPromptlToolContents(messages as PromptlMessage[])
}

export type { ToolRequest }
