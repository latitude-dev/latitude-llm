import type { SequenceExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'
import type { ResolveNodeProps, UpdateScopeContextProps } from '../types'

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

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<SequenceExpression>) {
  for (const expression of node.expressions) {
    updateScopeContextForNode({ node: expression, ...props })
  }
}
