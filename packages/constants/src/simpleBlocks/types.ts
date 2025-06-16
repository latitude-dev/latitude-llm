import type { CompileError, Fragment, IParser } from 'promptl-ai'

type ElementTag = IParser.ElementTag
type TemplateNode = IParser.TemplateNode
type IfBlock = IParser.IfBlock
type ForBlock = IParser.ForBlock
type MustacheTag = IParser.MustacheTag
type Text = IParser.Text

const MESSAGE_BLOCK = ['system', 'user', 'assistant', 'developer'] as const
export const CONTENT_BLOCK = [
  'content-image',
  'content-file',
  'tool-call',
  'text',
  'prompt',
] as const
export const BLOCK_TYPES = [...MESSAGE_BLOCK, ...CONTENT_BLOCK, 'step'] as const
export type MessageBlockType = (typeof MESSAGE_BLOCK)[number]
export type ContentBlockType = (typeof CONTENT_BLOCK)[number]

export type BlockType = (typeof BLOCK_TYPES)[number]
export type BlockAttributes = Record<string, string | boolean>

export type BlockError = {
  message: string
  startIndex: number
  endIndex: number
}

type SimpleBlock = {
  id: string
  errors?: BlockError[]
}

export type ImageBlock = SimpleBlock & {
  type: 'content-image'
  content: string
}

export type FileBlock = SimpleBlock & {
  type: 'content-file'
  content: string
  attributes: BlockAttributes & {
    name?: string
  }
}

export type ToolCallBlock = SimpleBlock & {
  type: 'tool-call'
  attributes: {
    id?: string
    name?: string
    parameters?: BlockAttributes
  }
}

export type TextBlock = SimpleBlock & {
  type: 'text'
  content: string
}

export type PromptBlock = SimpleBlock & {
  type: 'prompt'
  attributes: BlockAttributes & {
    path: string
  }
}
export type ContentBlock =
  | ImageBlock
  | FileBlock
  | ToolCallBlock
  | TextBlock
  | PromptBlock

export type MessageChild = ContentBlock
export type MessageBlock = SimpleBlock & {
  type: MessageBlockType
  children: MessageChild[]
}

export type StepChild = MessageBlock | ContentBlock
export type StepBlock = SimpleBlock & {
  type: 'step'
  children?: StepChild[]
  attributes?: {
    as?: string
    isolated?: boolean
  }
}

export type AnyBlock = StepBlock | MessageBlock | ContentBlock

export type AstError = {
  startIndex: CompileError['startIndex']
  endIndex: CompileError['endIndex']
  start: CompileError['start']
  end: CompileError['end']
  message: CompileError['message']
  name: CompileError['name']
}

export type {
  Fragment,
  ElementTag,
  TemplateNode,
  IfBlock,
  ForBlock,
  MustacheTag,
  Text,
}
