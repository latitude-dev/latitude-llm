import type { ChainExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'
import type { ResolveNodeProps, UpdateScopeContextProps } from '../types'

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

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<ChainExpression>) {
  updateScopeContextForNode({ node: node.expression, ...props })
}
