import { LegacyVercelSDKToolResultPart as ToolResultPart } from './ai'
import { ToolSourceData } from './toolSources'

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
  _sourceData?: ToolSourceData
}
export type MessageContent =
  | FileContent
  | ImageContent
  | ReasoningContent
  | RedactedReasoningContent
  | TextContent
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
  content: string | ToolRequestContent[] | MessageContent[]
  toolCalls: ToolCall[] | null
  _isGeneratingToolCall?: boolean
}
export type ToolMessage = {
  role: MessageRole.tool
  content: (TextContent | ToolContent | ToolResultPart)[]
  [key: string]: unknown
}

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
  _sourceData?: ToolSourceData
}

export type Message =
  | AssistantMessage
  | SystemMessage
  | ToolMessage
  | UserMessage

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
