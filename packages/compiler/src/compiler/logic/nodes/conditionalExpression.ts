import type { ConditionalExpression } from 'estree'

import { getLogicNodeMetadata, resolveLogicNode } from '..'
import { mergeMetadata } from '../../utils'
import type { ReadNodeMetadataProps, ResolveNodeProps } from '../types'

/**
 * ### ConditionalExpression
 * Represents a ternary operation.
 *
 * Example: `a ? b : c`
 */
export async function resolve({
  node,
  ...props
}: ResolveNodeProps<ConditionalExpression>) {
  const condition = await resolveLogicNode({ node: node.test, ...props })
  return await resolveLogicNode({
    node: condition ? node.consequent : node.alternate,
    ...props,
  })
}

export async function readMetadata({
  node,
  ...props
}: ReadNodeMetadataProps<ConditionalExpression>) {
  return mergeMetadata(
    await getLogicNodeMetadata({
      node: node.test,
      ...props,
    }),
    await getLogicNodeMetadata({
      node: node.consequent,
      ...props,
    }),
    await getLogicNodeMetadata({
      node: node.alternate,
      ...props,
    }),
  )
}
