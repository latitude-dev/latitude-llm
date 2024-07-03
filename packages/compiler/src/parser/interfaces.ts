import { type Node } from 'estree'

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

export interface Text extends BaseNode {
  type: 'Text'
  data: string
}

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
  context: Node
  index: Node
}

export type TemplateNode = BaseNode | Text | MustacheTag | Comment
