import { hasContent, isIterable } from '$compiler/compiler/utils'
import errors from '$compiler/error/errors'
import { EachBlock } from '$compiler/parser/interfaces'

import { CompileNodeContext } from '../types'

export async function compile({
  node,
  scope,
  isInsideContentTag,
  isInsideMessageTag,
  resolveBaseNode,
  resolveExpression,
  expressionError,
}: CompileNodeContext<EachBlock>) {
  const iterableElement = await resolveExpression(node.expression, scope)
  if (!isIterable(iterableElement) || !(await hasContent(iterableElement))) {
    const childScope = scope.copy()
    for await (const childNode of node.else?.children ?? []) {
      await resolveBaseNode({
        node: childNode,
        scope: childScope,
        isInsideMessageTag,
        isInsideContentTag,
      })
    }
    return
  }

  const contextVarName = node.context.name
  const indexVarName = node.index?.name
  if (scope.exists(contextVarName)) {
    throw expressionError(
      errors.variableAlreadyDeclared(contextVarName),
      node.context,
    )
  }

  if (indexVarName && scope.exists(indexVarName)) {
    throw expressionError(
      errors.variableAlreadyDeclared(indexVarName),
      node.index!,
    )
  }

  let i = 0
  for await (const element of iterableElement) {
    const localScope = scope.copy()
    localScope.set(contextVarName, element)
    if (indexVarName) {
      let indexValue: unknown = i
      if (node.key) {
        indexValue = await resolveExpression(node.key, localScope)
      }
      localScope.set(indexVarName, indexValue)
    }
    for await (const childNode of node.children ?? []) {
      await resolveBaseNode({
        node: childNode,
        scope: localScope,
        isInsideMessageTag,
        isInsideContentTag,
      })
    }
    i++
  }
}
