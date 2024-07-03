import type { ConditionalExpression } from 'estree'

import { resolveLogicNode } from '..'
import type { ResolveNodeProps } from '../types'

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
