import type Scope from '$compiler/compiler/scope'
import type { ScopePointers } from '$compiler/compiler/scope'
import type { TemplateNode } from '$compiler/parser/interfaces'
import type {
  AssistantMessage,
  Config,
  Message,
  MessageContent,
  PromptlSourceRef,
} from '$compiler/types'
import type { Node as LogicalExpression } from 'estree'

import type { ResolveBaseNodeProps, ToolCallReference } from '../types'

export enum NodeType {
  Literal = 'Literal',
  Identifier = 'Identifier',
  ObjectExpression = 'ObjectExpression',
  ArrayExpression = 'ArrayExpression',
  SequenceExpression = 'SequenceExpression',
  LogicalExpression = 'LogicalExpression',
  BinaryExpression = 'BinaryExpression',
  UnaryExpression = 'UnaryExpression',
  AssignmentExpression = 'AssignmentExpression',
  UpdateExpression = 'UpdateExpression',
  MemberExpression = 'MemberExpression',
  ConditionalExpression = 'ConditionalExpression',
  CallExpression = 'CallExpression',
  ChainExpression = 'ChainExpression',
}

type RaiseErrorFn<T = void | never, N = TemplateNode | LogicalExpression> = (
  { code, message }: { code: string; message: string },
  node: N,
) => T

type NodeStatus = {
  completedAs?: unknown
  scopePointers?: ScopePointers | undefined
  eachIterationIndex?: number
}

export type TemplateNodeWithStatus = TemplateNode & {
  status?: NodeStatus
}

export type CompileNodeContext<N extends TemplateNode> = {
  node: N
  scope: Scope
  resolveExpression: (expression: LogicalExpression, scope: Scope) => Promise<unknown>
  resolveBaseNode: (props: ResolveBaseNodeProps<TemplateNode>) => Promise<void>
  baseNodeError: RaiseErrorFn<never, TemplateNode>
  expressionError: RaiseErrorFn<never, LogicalExpression>

  isInsideMessageTag: boolean
  isInsideContentTag: boolean

  setConfig: (config: Config) => void
  addMessage: (message: Message) => void
  addStrayText: (text: string, node?: TemplateNode) => void
  popStrayText: () => { text: string; sourceMap: PromptlSourceRef[] }
  groupStrayText: () => void
  addContent: (content: MessageContent) => void
  popContent: () => MessageContent[]
  groupContent: () => void
  addToolCall: (toolCallRef: ToolCallReference) => void
  popToolCalls: () => ToolCallReference[]
  popStepResponse: () => AssistantMessage | undefined

  stop: (config?: Config) => void
}
