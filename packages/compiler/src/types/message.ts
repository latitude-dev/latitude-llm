export enum ContentType {
  text = 'text',
  image = 'image',
}

export enum MessageRole {
  system = 'system',
  user = 'user',
  assistant = 'assistant',
  tool = 'tool',
}

interface IMessageContent {
  type: ContentType
}

export type TextContent = IMessageContent & {
  type: ContentType.text
  value: string
}

export type ImageContent = IMessageContent & {
  type: ContentType.image
  value: string
}

export type MessageContent = TextContent | ImageContent

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

interface IMessage {
  role: MessageRole
  content: MessageContent[]
}

export type SystemMessage = IMessage & { role: MessageRole.system }

export type UserMessage = IMessage & {
  role: MessageRole.user
  name?: string
}

export type AssistantMessage = IMessage & {
  role: MessageRole.assistant
  toolCalls: ToolCall[]
}

export type ToolMessage = IMessage & {
  role: MessageRole.tool
  id: string
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
