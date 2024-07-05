import { resolveLogicNode, updateScopeContextForNode } from '$/compiler/logic'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$/compiler/logic/types'
import { isIterable } from '$/compiler/utils'
import errors from '$/error/errors'
import type { ArrayExpression } from 'estree'

/**
 * ### ArrayExpression
 * Returns an array of values
 */

export async function resolve({
  node,
  ...props
}: ResolveNodeProps<ArrayExpression>) {
  const { raiseError } = props
  const resolvedArray = []
  for (const element of node.elements) {
    if (!element) continue
    if (element.type !== 'SpreadElement') {
      const value = await resolveLogicNode({
        node: element,
        ...props,
      })
      resolvedArray.push(value)
      continue
    }

    const spreadObject = await resolveLogicNode({
      node: element.argument,
      ...props,
    })

    if (!isIterable(spreadObject)) {
      raiseError(errors.invalidSpreadInArray(typeof spreadObject), element)
    }

    for await (const value of spreadObject as Iterable<unknown>) {
      resolvedArray.push(value)
    }
  }

  return resolvedArray
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<ArrayExpression>) {
  for (const element of node.elements) {
    if (!element) continue

    updateScopeContextForNode({
      node: element.type === 'SpreadElement' ? element.argument : element,
      ...props,
    })
  }
}
