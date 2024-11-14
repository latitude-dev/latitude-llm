/**
 * OpenAI API reference for messages
 * Reference for https://api.openai.com/v1/chat/completions
 * Source: https://platform.openai.com/docs/api-reference/chat/create#chat-create-messages
 */

import { MessageRole } from '$promptl/types'

export enum ContentType {
  text = 'text',
  image = 'image',
  input_audio = 'input_audio',
}

interface IMessageContent {
  type: ContentType
  [key: string]: unknown
}

export type TextContent = IMessageContent & {
  type: ContentType.text
  text: string
}

export type ImageContent = IMessageContent & {
  type: ContentType.image
  image: string | Uint8Array | Buffer | ArrayBuffer | URL
}

export type AudioContent = IMessageContent & {
  type: ContentType.input_audio
  data: string
  format: string
}

export type MessageContent = TextContent | ImageContent | AudioContent

export type ToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface IMessage {
  role: MessageRole
  content: MessageContent[]
}

export type SystemMessage = IMessage & {
  role: MessageRole.system
  name?: string
  content: string | TextContent[]
}

export type UserMessage = IMessage & {
  role: MessageRole.user
  name?: string
  content: string | MessageContent[]
}

export type AssistantMessage = IMessage & {
  role: MessageRole.assistant
  content: string
  refusal?: string
  name?: string
  audio?: { id: string }
  tool_calls?: ToolCall[]
}

export type ToolMessage = IMessage & {
  role: MessageRole.tool
  tool_call_id: string
  content: string | MessageContent[]
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
