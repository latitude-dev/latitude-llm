import type { BinaryExpression, LogicalExpression } from 'estree'

import { getLogicNodeMetadata, resolveLogicNode } from '..'
import errors from '../../../error/errors'
import { mergeMetadata } from '../../utils'
import { BINARY_OPERATOR_METHODS } from '../operators'
import type { ReadNodeMetadataProps, ResolveNodeProps } from '../types'

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

export async function readMetadata({
  node,
  ...props
}: ReadNodeMetadataProps<BinaryExpression | LogicalExpression>) {
  return mergeMetadata(
    await getLogicNodeMetadata({
      node: node.left,
      ...props,
    }),
    await getLogicNodeMetadata({
      node: node.right,
      ...props,
    }),
  )
}
