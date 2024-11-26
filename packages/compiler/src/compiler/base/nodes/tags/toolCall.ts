import errors from '$compiler/error/errors'
import { ToolCallTag } from '$compiler/parser/interfaces'

import { CompileNodeContext } from '../../types'

export async function compile(
  {
    node,
    scope,
    isInsideMessageTag,
    isInsideContentTag,
    resolveBaseNode,
    baseNodeError,
    popStrayText,
    addToolCall,
  }: CompileNodeContext<ToolCallTag>,
  attributes: Record<string, unknown>,
) {
  if (isInsideContentTag) {
    baseNodeError(errors.toolCallTagInsideContent, node)
  }

  if (attributes['id'] === undefined) {
    baseNodeError(errors.toolCallTagWithoutId, node)
  }

  if (attributes['name'] === undefined) {
    baseNodeError(errors.toolCallWithoutName, node)
  }

  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideMessageTag,
      isInsideContentTag: true,
    })
  }

  const textContent = popStrayText().text

  let jsonContent: Record<string, unknown> = {}
  if (textContent) {
    try {
      jsonContent = JSON.parse(textContent)
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        baseNodeError(errors.invalidToolCallArguments, node)
      }
    }
  }

  addToolCall({
    node: node as ToolCallTag,
    value: {
      id: String(attributes['id']),
      name: String(attributes['name']),
      arguments: jsonContent,
    },
  })
}
