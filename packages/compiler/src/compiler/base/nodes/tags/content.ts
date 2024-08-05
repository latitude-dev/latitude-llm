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

  // TODO: This if else is probably not required but the types enforce it.
  // Improve types.
  if (node.name === 'text') {
    addContent({
      type: ContentType.text,
      text: textContent,
    })
  } else {
    addContent({
      type: ContentType.image,
      image: textContent,
    })
  }
}
