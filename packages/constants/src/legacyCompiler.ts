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
  type: string
  _promptlSourceMap?: PromptlSourceRef[]
  [key: string]: unknown
}
export type TextContent = IMessageContent & {
  type: 'text'
  text: string | undefined
  isReasoning?: boolean
  reasoning?: string | undefined
}
export type ImageContent = IMessageContent & {
  type: 'image'
  image: string | Uint8Array | Buffer | ArrayBuffer | URL
}
export type FileContent = IMessageContent & {
  type: 'file'
  file: string | Uint8Array | Buffer | ArrayBuffer | URL
  mimeType: string
}
export type ToolContent = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}
export type ToolRequestContent = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}
export type MessageContent =
  | TextContent
  | ImageContent
  | FileContent
  | ToolContent
  | ToolRequestContent

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
  content: (TextContent | ToolContent)[]
  [key: string]: unknown
}

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage

export type Config = Record<string, unknown>
export type Conversation = {
  config: Config
  messages: Message[]
}
export type ConversationMetadata = {
  resolvedPrompt: string
  config: Config
  errors: any[]
  parameters: Set<string>
  setConfig: (config: Config) => string
  includedPromptPaths: Set<string>
}
