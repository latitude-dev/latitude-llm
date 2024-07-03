import type { SequenceExpression } from 'estree'

import { getLogicNodeMetadata, resolveLogicNode } from '..'
import { mergeMetadata } from '../../utils'
import type { ReadNodeMetadataProps, ResolveNodeProps } from '../types'

/**
 * ### SequenceExpression
 * Represents a sequence of expressions. It is only used to evaluate ?. operators.
 */
export async function resolve({
  node,
  ...props
}: ResolveNodeProps<SequenceExpression>) {
  return await Promise.all(
    node.expressions.map((expression) =>
      resolveLogicNode({ node: expression, ...props }),
    ),
  )
}

export async function readMetadata({
  node,
  ...props
}: ReadNodeMetadataProps<SequenceExpression>) {
  const childrenMetadata = await Promise.all(
    node.expressions.map(async (expression) =>
      getLogicNodeMetadata({ node: expression, ...props }),
    ),
  )
  return mergeMetadata(...childrenMetadata)
}
