import { TemplateNode } from '$promptl/parser/interfaces'
import { MessageRole } from '$promptl/types'

import type Scope from './scope'

export type ResolveBaseNodeProps<N extends TemplateNode> = {
  node: N
  scope: Scope
  isInsideStepTag: boolean
  isInsideMessageTag: boolean
  isInsideContentTag: boolean
  completedValue?: unknown
}

export type CompileOptions = {
  defaultRole?: MessageRole
}
