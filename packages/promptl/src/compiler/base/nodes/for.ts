import { hasContent, isIterable } from '$promptl/compiler/utils'
import errors from '$promptl/error/errors'
import { ForBlock } from '$promptl/parser/interfaces'

import { CompileNodeContext, TemplateNodeWithStatus } from '../types'

type ForNodeWithStatus = TemplateNodeWithStatus & {
  status: TemplateNodeWithStatus['status'] & {
    loopIterationIndex: number
  }
}

export async function compile({
  node,
  scope,
  isInsideContentTag,
  isInsideMessageTag,
  resolveBaseNode,
  resolveExpression,
  expressionError,
}: CompileNodeContext<ForBlock>) {
  const nodeWithStatus = node as ForNodeWithStatus
  nodeWithStatus.status = {
    ...nodeWithStatus.status,
    scopePointers: scope.getPointers(),
  }

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
    if (i < (nodeWithStatus.status.loopIterationIndex ?? 0)) {
      i++
      continue
    }
    nodeWithStatus.status.loopIterationIndex = i

    const localScope = scope.copy()
    localScope.set(contextVarName, element)
    if (indexVarName) localScope.set(indexVarName, i)

    for await (const childNode of node.children ?? []) {
      await resolveBaseNode({
        node: childNode,
        scope: localScope,
        isInsideMessageTag,
        isInsideContentTag,
        completedValue: `step_${i}`,
      })
    }

    i++
  }

  nodeWithStatus.status = {
    ...nodeWithStatus.status,
    loopIterationIndex: 0,
  }
}
