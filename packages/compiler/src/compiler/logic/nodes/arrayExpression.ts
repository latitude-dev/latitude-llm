import type { ArrayExpression } from 'estree'

import { getLogicNodeMetadata, resolveLogicNode } from '..'
import errors from '../../../error/errors'
import { emptyMetadata, isIterable, mergeMetadata } from '../../utils'
import type { ReadNodeMetadataProps, ResolveNodeProps } from '../types'

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

export async function readMetadata({
  node,
  ...props
}: ReadNodeMetadataProps<ArrayExpression>) {
  const childrenMetadata = await Promise.all(
    node.elements.map(async (element) => {
      if (!element) return emptyMetadata()
      if (element.type === 'SpreadElement') {
        return await getLogicNodeMetadata({ node: element.argument, ...props })
      }
      return await getLogicNodeMetadata({ node: element, ...props })
    }),
  )
  return mergeMetadata(...childrenMetadata)
}
