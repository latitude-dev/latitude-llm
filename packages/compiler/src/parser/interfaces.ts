import { Identifier, type Node as LogicalExpression } from 'estree'

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

export type ElementTag = ContentTag | MessageTag | IElementTag

export interface MustacheTag extends BaseNode {
  type: 'MustacheTag'
  expression: LogicalExpression
}

export interface Comment extends BaseNode {
  type: 'Comment'
  data: string
  ignores: string[]
}

export interface ElseBlock extends BaseNode {
  type: 'ElseBlock'
}

export interface IfBlock extends BaseNode {
  type: 'IfBlock'
  expression: LogicalExpression
  else: ElseBlock | null
}

export interface EachBlock extends BaseNode {
  type: 'EachBlock'
  expression: LogicalExpression
  context: Identifier
  index: Identifier | null
  key: LogicalExpression
  else: ElseBlock | null
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
