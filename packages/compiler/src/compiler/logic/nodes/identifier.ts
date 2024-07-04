import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$/compiler/logic/types'
import errors from '$/error/errors'
import type { Identifier } from 'estree'

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

export function updateScopeContext({
  node,
  scopeContext,
}: UpdateScopeContextProps<Identifier>) {
  if (!scopeContext.definedVariables.has(node.name)) {
    scopeContext.usedUndefinedVariables.add(node.name)
  }
}
