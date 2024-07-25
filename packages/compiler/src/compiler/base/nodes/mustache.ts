import { MustacheTag } from '$compiler/parser/interfaces'

import { CompileNodeContext } from '../types'

export async function compile({
  node,
  scope,
  addStrayText,
  resolveExpression,
}: CompileNodeContext<MustacheTag>) {
  const expression = node.expression
  const value = await resolveExpression(expression, scope)
  if (value === undefined) return
  addStrayText(String(value))
}
