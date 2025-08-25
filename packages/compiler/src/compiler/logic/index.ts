import type { Node } from 'estree'

import { nodeResolvers, updateScopeContextResolvers } from './nodes'
import type { NodeType, ResolveNodeProps, UpdateScopeContextProps } from './types'

/**
 * Given a node, calculates the resulting value.
 */
export async function resolveLogicNode(props: ResolveNodeProps<Node>) {
  const type = props.node.type as NodeType
  if (!nodeResolvers[type]) {
    throw new Error(`Unknown node type: ${type}`)
  }

  const nodeResolver = nodeResolvers[props.node.type as NodeType]
  return nodeResolver(props)
}

/**
 * Given a node, keeps track of the defined variables.
 */
export async function updateScopeContextForNode(props: UpdateScopeContextProps<Node>) {
  const type = props.node.type as NodeType
  if (!nodeResolvers[type]) {
    throw new Error(`Unknown node type: ${type}`)
  }

  const updateScopeContextFn = updateScopeContextResolvers[props.node.type as NodeType]
  return updateScopeContextFn(props)
}
