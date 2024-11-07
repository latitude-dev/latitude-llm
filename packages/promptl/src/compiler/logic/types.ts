import Scope, { ScopeContext } from '$promptl/compiler/scope'
import { Node } from 'estree'

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

type RaiseErrorFn<T = void | never> = (
  { code, message }: { code: string; message: string },
  node: Node,
) => T

export type ResolveNodeProps<N extends Node> = {
  node: N
  scope: Scope
  raiseError: RaiseErrorFn<never>
}

export type UpdateScopeContextProps<N extends Node> = {
  node: N
  scopeContext: ScopeContext
  raiseError: RaiseErrorFn<void>
}
