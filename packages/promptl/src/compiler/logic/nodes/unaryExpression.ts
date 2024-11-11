import { UNARY_OPERATOR_METHODS } from '$compiler/compiler/logic/operators'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$compiler/compiler/logic/types'
import errors from '$compiler/error/errors'
import type { UnaryExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * ### UnaryExpression
 * Represents a simple operation on a single operand, either as a prefix or suffix.
 *
 * Example: `{!a}`
 */
export async function resolve({
  node,
  raiseError,
  ...props
}: ResolveNodeProps<UnaryExpression>) {
  const unaryOperator = node.operator
  if (!(unaryOperator in UNARY_OPERATOR_METHODS)) {
    raiseError(errors.unsupportedOperator(unaryOperator), node)
  }

  const unaryArgument = await resolveLogicNode({
    node: node.argument,
    raiseError,
    ...props,
  })
  const unaryPrefix = node.prefix
  return UNARY_OPERATOR_METHODS[unaryOperator]?.(unaryArgument, unaryPrefix)
}

export function updateScopeContext({
  node,
  scopeContext,
  ...props
}: UpdateScopeContextProps<UnaryExpression>) {
  const unaryOperator = node.operator
  if (!(unaryOperator in UNARY_OPERATOR_METHODS)) {
    props.raiseError(errors.unsupportedOperator(unaryOperator), node)
  }

  updateScopeContextForNode({ node: node.argument, scopeContext, ...props })
}
