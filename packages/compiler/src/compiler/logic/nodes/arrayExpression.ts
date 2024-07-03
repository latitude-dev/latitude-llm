import type { ArrayExpression } from 'estree'

import { resolveLogicNode } from '..'
import errors from '../../../error/errors'
import { isIterable } from '../../utils'
import type { ResolveNodeProps } from '../types'

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
