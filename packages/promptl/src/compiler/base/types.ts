import Scope, { ScopePointers } from '$promptl/compiler/scope'
import { TemplateNode } from '$promptl/parser/interfaces'
import {
  AssistantMessage,
  Config,
  Message,
  MessageContent,
} from '$promptl/types'
import type { Node as LogicalExpression } from 'estree'

import { ResolveBaseNodeProps } from '../types'

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
  resolveExpression: (
    expression: LogicalExpression,
    scope: Scope,
  ) => Promise<unknown>
  resolveBaseNode: (props: ResolveBaseNodeProps<TemplateNode>) => Promise<void>
  baseNodeError: RaiseErrorFn<never, TemplateNode>
  expressionError: RaiseErrorFn<never, LogicalExpression>

  isInsideMessageTag: boolean
  isInsideContentTag: boolean

  setConfig: (config: Config) => void
  addMessage: (message: Message) => void
  addStrayText: (text: string) => void
  popStrayText: () => string
  groupStrayText: () => void
  addContent: (item: { node?: TemplateNode; content: MessageContent }) => void
  popContent: () => { node?: TemplateNode; content: MessageContent }[]
  groupContent: () => void
  popStepResponse: () => AssistantMessage | undefined

  stop: (config?: Config) => void
}
