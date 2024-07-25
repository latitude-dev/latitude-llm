import { IfBlock } from '$compiler/parser/interfaces'

import { CompileNodeContext } from '../types'

export async function compile({
  node,
  scope,
  isInsideContentTag,
  isInsideMessageTag,
  resolveBaseNode,
  resolveExpression,
}: CompileNodeContext<IfBlock>) {
  const condition = await resolveExpression(node.expression, scope)
  const children = (condition ? node.children : node.else?.children) ?? []
  const childScope = scope.copy()
  for await (const childNode of children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope: childScope,
      isInsideMessageTag,
      isInsideContentTag,
    })
  }
}
