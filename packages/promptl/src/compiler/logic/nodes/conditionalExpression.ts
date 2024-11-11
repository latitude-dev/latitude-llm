import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$promptl/compiler/logic/types'
import type { ConditionalExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

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

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<ConditionalExpression>) {
  updateScopeContextForNode({ node: node.test, ...props })
  updateScopeContextForNode({ node: node.consequent, ...props })
  updateScopeContextForNode({ node: node.alternate, ...props })
}
