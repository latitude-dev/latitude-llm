import errors from '$compiler/error/errors'
import { ContentTag } from '$compiler/parser/interfaces'
import { ContentType } from '$compiler/types'

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
    addContent,
  }: CompileNodeContext<ContentTag>,
  _: Record<string, unknown>,
) {
  if (isInsideContentTag) {
    baseNodeError(errors.contentTagInsideContent, node)
  }

  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideMessageTag,
      isInsideContentTag: true,
    })
  }
  const textContent = popStrayText()

  addContent({
    type: node.name as ContentType,
    value: textContent,
  })
}
