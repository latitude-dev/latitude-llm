import type { UnaryExpression } from 'estree'

import { resolveLogicNode } from '..'
import errors from '../../../error/errors'
import { UNARY_OPERATOR_METHODS } from '../operators'
import type { ResolveNodeProps } from '../types'

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
