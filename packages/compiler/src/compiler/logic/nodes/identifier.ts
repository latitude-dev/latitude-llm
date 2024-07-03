import type { Identifier } from 'estree'

import errors from '../../../error/errors'
import type { ResolveNodeProps } from '../types'

/**
 * ### Identifier
 * Represents a variable from the scope.
 */
export async function resolve({
  node,
  scope,
  raiseError,
}: ResolveNodeProps<Identifier>) {
  if (!scope.exists(node.name)) {
    raiseError(errors.variableNotDeclared(node.name), node)
  }
  return scope.get(node.name)
}
