import { TemplateNode } from '$promptl/parser/interfaces'
import { MessageRole } from '$promptl/types'

import type Scope from './scope'

export type Document = {
  path: string
  content: string
}
export type ReferencePromptFn = (
  path: string,
  from?: string,
) => Promise<Document | undefined>

export type ResolveBaseNodeProps<N extends TemplateNode> = {
  node: N
  scope: Scope
  isInsideStepTag: boolean
  isInsideMessageTag: boolean
  isInsideContentTag: boolean
  completedValue?: unknown
  fullPath?: string | undefined
}

export type CompileOptions = {
  referenceFn?: ReferencePromptFn
  fullPath?: string
  defaultRole?: MessageRole
}
