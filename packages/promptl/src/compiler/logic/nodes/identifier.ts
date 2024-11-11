import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$compiler/compiler/logic/types'
import errors from '$compiler/error/errors'
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
  raiseError,
}: UpdateScopeContextProps<Identifier>) {
  if (!scopeContext.definedVariables.has(node.name)) {
    if (scopeContext.onlyPredefinedVariables === undefined) {
      scopeContext.usedUndefinedVariables.add(node.name)
      return
    }
    if (!scopeContext.onlyPredefinedVariables.has(node.name)) {
      raiseError(errors.variableNotDefined(node.name), node)
    }
  }
}
