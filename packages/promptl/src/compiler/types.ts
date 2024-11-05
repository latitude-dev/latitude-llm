import { TemplateNode, ToolCallTag } from '$compiler/parser/interfaces'
import { ToolCall } from '$compiler/types'

import type Scope from './scope'

export type ResolveBaseNodeProps<N extends TemplateNode> = {
  node: N
  scope: Scope
  isInsideMessageTag: boolean
  isInsideContentTag: boolean
  completedValue?: unknown
}

export type ToolCallReference = { node: ToolCallTag; value: ToolCall }
