import { hasContent, isIterable } from '$compiler/compiler/utils'
import errors from '$compiler/error/errors'
import type { EachBlock } from '$compiler/parser/interfaces'

import type { CompileNodeContext, TemplateNodeWithStatus } from '../types'

type EachNodeWithStatus = TemplateNodeWithStatus & {
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
}: CompileNodeContext<EachBlock>) {
  const nodeWithStatus = node as EachNodeWithStatus
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
    throw expressionError(errors.variableAlreadyDeclared(contextVarName), node.context)
  }

  if (indexVarName && scope.exists(indexVarName)) {
    throw expressionError(errors.variableAlreadyDeclared(indexVarName), node.index!)
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
