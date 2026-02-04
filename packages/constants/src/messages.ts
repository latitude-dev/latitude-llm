import { ToolSourceData } from './toolSources'

export type ContentType =
  | 'file'
  | 'image'
  | 'reasoning'
  | 'redacted-reasoning'
  | 'text'
  | 'tool-call'
  | 'tool-result'

export type MessageRole = 'assistant' | 'developer' | 'system' | 'tool' | 'user'

export type PromptlSourceRef = {
  start: number
  end: number
  identifier?: string
}
type IMessageContent = {
  _promptlSourceMap?: PromptlSourceRef[]
}
export type ReasoningContent = IMessageContent & {
  type: 'reasoning'
  text: string
  id?: string
  isStreaming?: boolean
}
export type RedactedReasoningContent = IMessageContent & {
  type: 'redacted-reasoning'
  data: string
}
export type TextContent = IMessageContent & {
  type: 'text'
  text: string | undefined
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
export type ToolRequestContent = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  _sourceData?: ToolSourceData
}
export type ToolResultContent = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

export type MessageContent =
  | FileContent
  | ImageContent
  | ReasoningContent
  | RedactedReasoningContent
  | TextContent
  | ToolResultContent
  | ToolRequestContent

type IMessage = {
  name?: string
  _promptlSourceMap?: PromptlSourceRef[]
}

export type SystemMessage = IMessage & {
  role: 'system'
  content: MessageContent[]
}

export type UserMessage = IMessage & {
  role: 'user'
  content: MessageContent[]
}

export type AssistantMessage = IMessage & {
  role: 'assistant'
  content: MessageContent[]
  // DEPRECATED but keeping around for backwards compatibility
  toolCalls?: ToolCall[] | null
  _isGeneratingToolCall?: boolean
}

export type ToolMessage = IMessage & {
  role: 'tool'
  content: (TextContent | ToolResultContent)[]
}

export type Message =
  | AssistantMessage
  | SystemMessage
  | ToolMessage
  | UserMessage

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
  _sourceData?: ToolSourceData
}

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
