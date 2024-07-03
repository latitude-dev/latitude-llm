import { Identifier, type Node } from 'estree'

import { ContentType, MessageRole } from '../types'

export interface BaseNode {
  start: number | null
  end: number | null
  type: string
  children?: TemplateNode[]
  [propName: string]: any
}

export interface Fragment extends BaseNode {
  type: 'Fragment'
  children: TemplateNode[]
}

export interface Config extends BaseNode {
  type: 'Config'
  value: Record<string, any>
}

export interface Text extends BaseNode {
  type: 'Text'
  data: string
}

export interface Attribute extends BaseNode {
  type: 'Attribute'
  name: string
  value: TemplateNode[] | true
}

interface IElementTag extends BaseNode {
  type: 'ElementTag'
  name: string
  attributes: Attribute[]
  children: TemplateNode[]
}

export type ContentTag = IElementTag & {
  name: ContentType
}

export type MessageTag = IElementTag & {
  name: MessageRole
}

export type ElementTag = ContentTag | MessageTag

export interface MustacheTag extends BaseNode {
  type: 'MustacheTag'
  expression: Node
}

export interface Comment extends BaseNode {
  type: 'Comment'
  data: string
  ignores: string[]
}

export interface IfBlock extends BaseNode {
  type: 'IfBlock'
  condition: Node
}

export interface ElseBlock extends BaseNode {
  type: 'ElseBlock'
}

export interface EachBlock extends BaseNode {
  type: 'EachBlock'
  expression: Node
  context: Identifier
  index: Identifier | null
}

export type TemplateNode =
  | BaseNode
  | Text
  | MustacheTag
  | Comment
  | ElementTag
  | IfBlock
  | ElseBlock
  | EachBlock
