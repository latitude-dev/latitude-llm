import type { MustacheTag } from '$compiler/parser/interfaces'

import type { CompileNodeContext } from '../types'

export async function compile({
  node,
  scope,
  addStrayText,
  resolveExpression,
}: CompileNodeContext<MustacheTag>) {
  const expression = node.expression
  const value = await resolveExpression(expression, scope)
  if (value === undefined) return

  if (typeof value === 'object' && value !== null) {
    addStrayText(JSON.stringify(value), node)
    return
  }

  addStrayText(String(value), node)
}
