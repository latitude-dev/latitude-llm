import { AstError } from '@latitude-data/constants/promptl'
import {
  SerializedElementNode,
  SerializedLexicalNode,
  SerializedParagraphNode,
  SerializedRootNode,
  SerializedTextNode,
} from 'lexical'
import type { Fragment, IParser } from 'promptl-ai'

type ElementTag = IParser.ElementTag
type TemplateNode = IParser.TemplateNode
type MustacheTag = IParser.MustacheTag

export const BLOCK_EDITOR_TYPE = {
  ROOT: 'root', // Native Lexical type
  PARAGRAPH: 'paragraph', // Native Lexical type
  TEXT_CONTENT: 'text', // Native Lexical type
  CODE: 'code', // Native Lexical type
  STEP: 'step',
  CONFIG: 'config',
  MESSAGE: 'message',
  REFERENCE_LINK: 'reference_link',
  FILE_CONTENT: 'content_file',
  IMAGE_CONTENT: 'content_image',
  VARIABLE: 'variable',
} as const

export const MESSAGE_BLOCK = ['system', 'user', 'assistant'] as const
export const CONTENT_BLOCK = ['content-image', 'content-file'] as const
export const BLOCK_WITH_CHILDREN = [...MESSAGE_BLOCK, 'step'] as const
export type BlockWithChildren = (typeof BLOCK_WITH_CHILDREN)[number]
export type MessageBlockType = (typeof MESSAGE_BLOCK)[number]
export type ContentBlockType = (typeof CONTENT_BLOCK)[number]

export type BlockAttributes = Record<
  string,
  string | boolean | null | undefined
>

interface SimpleBlock extends SerializedLexicalNode {
  errors?: AstError[]
  readOnly?: boolean
}

export interface ImageBlock extends SimpleBlock {
  type: typeof BLOCK_EDITOR_TYPE.IMAGE_CONTENT
  content: string
}

export interface FileBlock extends SimpleBlock {
  type: typeof BLOCK_EDITOR_TYPE.FILE_CONTENT
  content: string
  attributes: BlockAttributes & {
    mime?: string
  }
}

export interface ReferenceLink extends SimpleBlock {
  type: typeof BLOCK_EDITOR_TYPE.REFERENCE_LINK
  path: string
  attributes: BlockAttributes
}

export interface Variable extends SimpleBlock {
  type: typeof BLOCK_EDITOR_TYPE.VARIABLE
  name: string
  errors?: AstError[]
}

export interface TextBlock extends SerializedTextNode {
  type: typeof BLOCK_EDITOR_TYPE.TEXT_CONTENT
  readOnly?: boolean
}

export interface CodeBlock extends SimpleBlock {
  type: typeof BLOCK_EDITOR_TYPE.CODE
  children: TextBlock[]
  errors?: AstError[]
}

export type ContentBlock = ImageBlock | FileBlock
export type InlineBlock = ReferenceLink | Variable | TextBlock

export interface ParagraphBlock extends SerializedParagraphNode {
  type: typeof BLOCK_EDITOR_TYPE.PARAGRAPH
  children: Array<ContentBlock | InlineBlock>
  errors?: AstError[]
  readOnly?: boolean
}

export interface MessageBlock extends SerializedElementNode {
  type: typeof BLOCK_EDITOR_TYPE.MESSAGE
  role: MessageBlockType
  children: (ParagraphBlock | CodeBlock)[]
  errors?: AstError[]
  readOnly?: boolean
}

export type StepChild = MessageBlock | ParagraphBlock | CodeBlock
export interface StepBlock extends SerializedElementNode {
  type: typeof BLOCK_EDITOR_TYPE.STEP
  children: StepChild[]
  errors?: AstError[]
  attributes?: {
    as?: string
    isolated?: boolean
    otherAttributes?: Record<string, unknown>
  }
  readOnly?: boolean
}

type RootChild = StepBlock | StepChild
export interface BlockRootNode
  extends SerializedRootNode<SerializedLexicalNode> {
  type: 'root'
  children: RootChild[]
  readOnly?: boolean
}

export type { ElementTag, Fragment, MustacheTag, TemplateNode }
