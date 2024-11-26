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

export type PromptlSourceRef = {
  start: number
  end: number
  identifier?: string
}

interface IMessageContent {
  type: ContentType
  _promptlSourceMap?: PromptlSourceRef[]
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
  [key: string]: unknown
}

export type SystemMessage = IMessage & {
  role: MessageRole.system
}

export type UserMessage = IMessage & {
  role: MessageRole.user
  name?: string
}

export type AssistantMessage = {
  role: MessageRole.assistant
  toolCalls: ToolCall[]
  content: string | ToolRequestContent[] | MessageContent[]
}

export type ToolMessage = {
  role: MessageRole.tool
  content: ToolContent[]
  [key: string]: unknown
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
