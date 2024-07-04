import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$/compiler/logic/types'
import CompileError from '$/error/error'
import errors from '$/error/errors'
import type { SimpleCallExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * ### CallExpression
 * Represents a method call.
 *
 * Examples: `foo()` `foo.bar()`
 */
export async function resolve(props: ResolveNodeProps<SimpleCallExpression>) {
  const { node, raiseError } = props
  const method = (await resolveLogicNode({
    ...props,
    node: node.callee,
  })) as Function

  if (typeof method !== 'function') {
    raiseError(errors.notAFunction(typeof method), node)
  }

  const args = await resolveArgs(props)
  return await runMethod({ ...props, method, args })
}

function resolveArgs(
  props: ResolveNodeProps<SimpleCallExpression>,
): Promise<unknown[]> {
  const { node } = props
  return Promise.all(
    node.arguments.map((arg) =>
      resolveLogicNode({
        ...props,
        node: arg,
      }),
    ),
  )
}

async function runMethod({
  method,
  args,
  node,
  raiseError,
}: ResolveNodeProps<SimpleCallExpression> & {
  method: Function
  args: unknown[]
}) {
  try {
    return await method(...args)
  } catch (error: unknown) {
    if (error instanceof CompileError) throw error
    raiseError(errors.functionCallError(error), node)
  }
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<SimpleCallExpression>) {
  updateScopeContextForNode({ node: node.callee, ...props })
  for (const arg of node.arguments) {
    updateScopeContextForNode({ node: arg, ...props })
  }
}
