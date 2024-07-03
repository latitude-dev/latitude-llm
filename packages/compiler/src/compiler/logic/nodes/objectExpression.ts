import { type Identifier, type ObjectExpression } from 'estree'

import { getLogicNodeMetadata, resolveLogicNode } from '..'
import errors from '../../../error/errors'
import { QueryMetadata } from '../../types'
import { mergeMetadata } from '../../utils'
import { ReadNodeMetadataProps, type ResolveNodeProps } from '../types'

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

export async function readMetadata({
  node,
  ...props
}: ReadNodeMetadataProps<ObjectExpression>) {
  const propertiesMetadata = await Promise.all(
    node.properties
      .map((prop) => {
        if (prop.type === 'SpreadElement') {
          return getLogicNodeMetadata({
            node: prop.argument,
            ...props,
          })
        }
        if (prop.type === 'Property') {
          return Promise.all([
            getLogicNodeMetadata({
              node: prop.key,
              ...props,
            }),
            getLogicNodeMetadata({
              node: prop.value,
              ...props,
            }),
          ])
        }
      })
      .filter((p) => p !== undefined),
  )

  return mergeMetadata(...(propertiesMetadata.flat() as QueryMetadata[]))
}
