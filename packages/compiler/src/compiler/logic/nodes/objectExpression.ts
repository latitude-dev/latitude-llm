import {
  resolveLogicNode,
  updateScopeContextForNode,
} from '$compiler/compiler/logic'
import {
  UpdateScopeContextProps,
  type ResolveNodeProps,
} from '$compiler/compiler/logic/types'
import errors from '$compiler/error/errors'
import { type Identifier, type ObjectExpression } from 'estree'

/**
 * ### ObjectExpression
 * Represents a javascript Object
 */
export async function resolve({
  node,
  scope,
  raiseError,
  ...props
}: ResolveNodeProps<ObjectExpression>) {
  const resolvedObject: { [key: string]: any } = {}
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      const spreadObject = await resolveLogicNode({
        node: prop.argument,
        scope,
        raiseError,
        ...props,
      })
      if (typeof spreadObject !== 'object') {
        raiseError(errors.invalidSpreadInObject(typeof spreadObject), prop)
      }
      Object.entries(spreadObject as object).forEach(([key, value]) => {
        resolvedObject[key] = value
      })
      continue
    }
    if (prop.type === 'Property') {
      const key = prop.key as Identifier
      const value = await resolveLogicNode({
        node: prop.value,
        scope,
        raiseError,
        ...props,
      })
      resolvedObject[key.name] = value
      continue
    }
    throw raiseError(errors.invalidObjectKey, prop)
  }
  return resolvedObject
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<ObjectExpression>) {
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      updateScopeContextForNode({ node: prop.argument, ...props })
      continue
    }
    if (prop.type === 'Property') {
      updateScopeContextForNode({ node: prop.value, ...props })
      continue
    }
    props.raiseError(errors.invalidObjectKey, prop)
  }
}
