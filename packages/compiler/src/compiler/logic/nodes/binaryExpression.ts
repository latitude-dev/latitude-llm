import { BINARY_OPERATOR_METHODS } from '$compiler/compiler/logic/operators'
import type { ResolveNodeProps, UpdateScopeContextProps } from '$compiler/compiler/logic/types'
import errors from '$compiler/error/errors'
import type { BinaryExpression, LogicalExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * ### BinaryExpression
 * Represents a simple operation between two operands.
 *
 * Example: `{a > b}`
 */
export async function resolve({
  node,
  raiseError,
  ...props
}: ResolveNodeProps<BinaryExpression | LogicalExpression>) {
  const binaryOperator = node.operator
  if (!(binaryOperator in BINARY_OPERATOR_METHODS)) {
    raiseError(errors.unsupportedOperator(binaryOperator), node)
  }
  const leftOperand = await resolveLogicNode({
    node: node.left,
    raiseError,
    ...props,
  })
  const rightOperand = await resolveLogicNode({
    node: node.right,
    raiseError,
    ...props,
  })

  return BINARY_OPERATOR_METHODS[binaryOperator]?.(leftOperand, rightOperand)
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<BinaryExpression | LogicalExpression>) {
  const binaryOperator = node.operator
  if (!(binaryOperator in BINARY_OPERATOR_METHODS)) {
    props.raiseError(errors.unsupportedOperator(binaryOperator), node)
  }

  updateScopeContextForNode({ node: node.left, ...props })
  updateScopeContextForNode({ node: node.right, ...props })
}
