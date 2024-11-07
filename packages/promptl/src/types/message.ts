/* Message Content */

export enum ContentType {
  text = 'text',
  image = 'image',
  toolCall = 'tool-call',
}

export enum ContentTypeTagName {
  // This is used to translate between the tag name and the actual tag value
  text = 'content-text',
  image = 'content-image',
  toolCall = 'tool-call',
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

export type ToolCallContent = {
  type: ContentType.toolCall
  toolCallId: string
  toolName: string
  toolArguments: Record<string, unknown>
}

export type MessageContent = TextContent | ImageContent | ToolCallContent

/* Message */

export enum MessageRole {
  system = 'system',
  user = 'user',
  assistant = 'assistant',
  tool = 'tool',
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

export type AssistantMessage = IMessage & {
  role: MessageRole.assistant
}

export type ToolMessage = IMessage & {
  role: MessageRole.tool
  toolId: string
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
