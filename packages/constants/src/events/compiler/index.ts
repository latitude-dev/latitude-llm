export enum ContentType {
  text = 'text',
  image = 'image',
  file = 'file', // Not supported but it is here because almost all code uses legacy compiler types
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
  text: string | undefined
  isReasoning?: boolean
  reasoning?: string | undefined
}

export type ImageContent = IMessageContent & {
  type: ContentType.image
  image: string | Uint8Array | Buffer | ArrayBuffer | URL
}

// Not supported but it is here because almost all code uses legacy compiler types
export type FileContent = IMessageContent & {
  type: ContentType.file
  file: string | Uint8Array | Buffer | ArrayBuffer | URL
  mimeType: string
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
  | FileContent // Not supported but it is here because almost all code uses legacy compiler types
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
  content: (TextContent | ToolContent)[]
  [key: string]: unknown
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
  errors: CompileError[]
  parameters: Set<string> // Variables used in the prompt that have not been defined in runtime
  setConfig: (config: Config) => string
  includedPromptPaths: Set<string>
}

class CompileError extends Error {
  code?: string
  start?: Position
  end?: Position
  pos?: number
  frame?: string
  fragment?: Fragment

  toString() {
    if (!this.start) return this.message
    return `${this.message} (${this.start.line}:${this.start.column})\n${this.frame}`
  }
}

export interface Position {
  line: number
  column: number
}

export type Fragment = BaseNode & {
  type: 'Fragment'
  children: TemplateNode[]
}

export type BaseNode = {
  start: number | null
  end: number | null
  type: string
  children?: TemplateNode[]
  [propName: string]: any
}

export type TemplateNode =
  | Fragment
  | Config
  | Text
  | ElementTag
  | MustacheTag
  | Comment
  | IfBlock
  | EachBlock

export type Attribute = BaseNode & {
  type: 'Attribute'
  name: string
  value: TemplateNode[] | true
}
type IElementTag<T extends string> = BaseNode & {
  type: 'ElementTag'
  name: T
  attributes: Attribute[]
  children: TemplateNode[]
}
export type ContentTag = IElementTag<ContentType>
export type MessageTag = IElementTag<MessageRole> | IElementTag<string>
export type ReferenceTag = IElementTag<string>
export type ChainStepTag = IElementTag<string>
export type ToolCallTag = IElementTag<string>
export type ElementTag =
  | ContentTag
  | MessageTag
  | ReferenceTag
  | IElementTag<string>

export type EachBlock = BaseNode & {
  type: 'EachBlock'
  expression: unknown
  context: unknown
  index: unknown
  key: unknown
  else: ElseBlock | null
}

export type MustacheTag = BaseNode & {
  type: 'MustacheTag'
  expression: unknown
}

export type Comment = BaseNode & {
  type: 'Comment'
  data: string
}

export type ElseBlock = BaseNode & {
  type: 'ElseBlock'
}

export type IfBlock = BaseNode & {
  type: 'IfBlock'
  expression: unknown
  else: ElseBlock | null
}
