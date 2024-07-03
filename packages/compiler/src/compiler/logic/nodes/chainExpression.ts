import type { ChainExpression } from 'estree'

import { resolveLogicNode } from '..'
import type { ResolveNodeProps } from '../types'

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
