/**
 * Anthropic API reference for messages
 * Reference for https://api.anthropic.com/v1/messages
 * Source: https://docs.anthropic.com/en/api/messages
 */

import { MessageRole as PromptlMessageRole } from '$promptl/types'

export enum MessageRole {
  user = PromptlMessageRole.user,
  assistant = PromptlMessageRole.assistant,
}

export enum ContentType {
  text = 'text',
  image = 'image',
  tool_use = 'tool_use',
  tool_result = 'tool_result',
  document = 'document',
}

interface IMessageContent {
  type: ContentType
  cache_control?: {
    type: string
  }
  [key: string]: unknown
}

export type TextContent = IMessageContent & {
  type: ContentType.text
  text: string
}

export type ImageContent = IMessageContent & {
  type: ContentType.image
  source: {
    type: string
    media_type: string
    data: string
  }
}

export type ToolUseContent = IMessageContent & {
  type: ContentType.tool_use
  id: string
  name: string
  input: object
}

export type ToolResultContent = IMessageContent & {
  type: ContentType.tool_result
  tool_use_id: string
  is_error?: boolean
  content?: string | (TextContent | ImageContent)[]
}

export type DocumentContent = IMessageContent & {
  type: ContentType.document
  source: {
    type: string
    media_type: string
    data: string
  }
}

export type MessageContent =
  | TextContent
  | ImageContent
  | DocumentContent
  | ToolUseContent
  | ToolResultContent

interface IMessage {
  role: MessageRole
  content: string | MessageContent[]
}

export type UserMessage = IMessage & {
  role: MessageRole.user
}

export type AssistantMessage = IMessage & {
  role: MessageRole.assistant
}

export type Message = UserMessage | AssistantMessage
