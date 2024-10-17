export enum ContentType {
  text = 'text',
  image = 'image',
  toolCall = 'tool-call',
  toolResult = 'tool-result',
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
  text: string
}

export type ImageContent = IMessageContent & {
  type: ContentType.image
  image: string | Uint8Array | Buffer | ArrayBuffer | URL
}

export type ToolContent = {
  type: ContentType.toolResult
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

export type ToolRequestContent = {
  type: ContentType.toolCall
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export type MessageContent =
  | TextContent
  | ImageContent
  | ToolContent
  | ToolRequestContent

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

interface IMessage {
  role: MessageRole
  content: MessageContent[]
}

export type SystemMessage = {
  role: MessageRole.system
  content: string
}

export type UserMessage = IMessage & {
  role: MessageRole.user
  name?: string
}

export type AssistantMessage = {
  role: MessageRole.assistant
  toolCalls: ToolCall[]
  content: string | ToolRequestContent[]
}

export type ToolMessage = IMessage & {
  role: MessageRole.tool
  content: ToolContent[]
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
