import {
  CHAIN_STEP_TAG,
  CUSTOM_MESSAGE_TAG,
  REFERENCE_PROMPT_TAG,
  TOOL_CALL_TAG,
} from '$compiler/constants'
import { ContentType, MessageRole } from '$compiler/types'
import { Identifier, type Node as LogicalExpression } from 'estree'

export type BaseNode = {
  start: number | null
  end: number | null
  type: string
  children?: TemplateNode[]
  [propName: string]: unknown
}

export type Fragment = BaseNode & {
  type: 'Fragment'
  children: TemplateNode[]
}

export type Config = BaseNode & {
  type: 'Config'
  value: string
}

export type Text = BaseNode & {
  type: 'Text'
  data: string
}

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
export type MessageTag =
  | IElementTag<MessageRole>
  | IElementTag<typeof CUSTOM_MESSAGE_TAG>
export type ReferenceTag = IElementTag<typeof REFERENCE_PROMPT_TAG>
export type ChainStepTag = IElementTag<typeof CHAIN_STEP_TAG>
export type ToolCallTag = IElementTag<typeof TOOL_CALL_TAG>
export type ElementTag =
  | ContentTag
  | MessageTag
  | ReferenceTag
  | IElementTag<string>

export type MustacheTag = BaseNode & {
  type: 'MustacheTag'
  expression: LogicalExpression
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
  expression: LogicalExpression
  else: ElseBlock | null
}

export type EachBlock = BaseNode & {
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
