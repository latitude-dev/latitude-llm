import type { ChainExpression } from 'estree'

import { getLogicNodeMetadata, resolveLogicNode } from '..'
import type { ReadNodeMetadataProps, ResolveNodeProps } from '../types'

/**
 * ### Chain Expression
 * Represents a chain of operations. This is only being used for optional member expressions '?.'
 */
export async function resolve({
  node,
  ...props
}: ResolveNodeProps<ChainExpression>) {
  return resolveLogicNode({
    node: node.expression,
    ...props,
  })
}

export async function readMetadata({
  node,
  ...props
}: ReadNodeMetadataProps<ChainExpression>) {
  return await getLogicNodeMetadata({
    node: node.expression,
    ...props,
  })
}
