import { resolveLogicNode, updateScopeContextForNode } from '$/compiler/logic'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$/compiler/logic/types'
import type { SequenceExpression } from 'estree'

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
