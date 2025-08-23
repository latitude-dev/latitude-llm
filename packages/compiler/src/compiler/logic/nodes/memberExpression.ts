import { MEMBER_EXPRESSION_METHOD } from '$compiler/compiler/logic/operators'
import type { ResolveNodeProps, UpdateScopeContextProps } from '$compiler/compiler/logic/types'
import type { Identifier, MemberExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * ### MemberExpression
 * Represents a property from an object. If the property does not exist in the object, it will return undefined.
 */
export async function resolve({ node, ...props }: ResolveNodeProps<MemberExpression>) {
  const object = await resolveLogicNode({
    node: node.object,
    ...props,
  })

  // Accessing to the property can be optional (?.)
  if (object == null && node.optional) return undefined

  const property = node.computed
    ? await resolveLogicNode({
        node: node.property,
        ...props,
      })
    : (node.property as Identifier).name

  return MEMBER_EXPRESSION_METHOD(object, property)
}

export function updateScopeContext({ node, ...props }: UpdateScopeContextProps<MemberExpression>) {
  updateScopeContextForNode({ node: node.object, ...props })
  if (node.computed) {
    updateScopeContextForNode({ node: node.property, ...props })
  }
}
