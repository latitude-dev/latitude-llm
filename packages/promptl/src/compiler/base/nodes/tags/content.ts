import { removeCommonIndent } from '$promptl/compiler/utils'
import {
  CUSTOM_CONTENT_TAG,
  CUSTOM_CONTENT_TYPE_ATTR,
} from '$promptl/constants'
import errors from '$promptl/error/errors'
import { ContentTag } from '$promptl/parser/interfaces'
import { ContentType, ContentTypeTagName } from '$promptl/types'

import { CompileNodeContext } from '../../types'

export async function compile(
  {
    node,
    scope,
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    resolveBaseNode,
    baseNodeError,
    popStrayText,
    addContent,
  }: CompileNodeContext<ContentTag>,
  attributes: Record<string, unknown>,
) {
  if (isInsideContentTag) {
    baseNodeError(errors.contentTagInsideContent, node)
  }

  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideStepTag,
      isInsideMessageTag,
      isInsideContentTag: true,
    })
  }
  const textContent = removeCommonIndent(popStrayText())

  let type: ContentType
  if (node.name === CUSTOM_CONTENT_TAG) {
    if (attributes[CUSTOM_CONTENT_TYPE_ATTR] === undefined) {
      baseNodeError(errors.messageTagWithoutRole, node)
    }
    type = attributes[CUSTOM_CONTENT_TYPE_ATTR] as ContentType
    delete attributes[CUSTOM_CONTENT_TYPE_ATTR]
  } else {
    const contentTypeKeysFromTagName = Object.fromEntries(
      Object.entries(ContentTypeTagName).map(([k, v]) => [v, k]),
    )
    type =
      ContentType[
        contentTypeKeysFromTagName[node.name] as keyof typeof ContentType
      ]
  }

  if (type === ContentType.text) {
    addContent({
      node,
      content: {
        ...attributes,
        type: ContentType.text,
        text: textContent,
      },
    })
    return
  }

  if (type === ContentType.image) {
    addContent({
      node,
      content: {
        ...attributes,
        type: ContentType.image,
        image: textContent,
      },
    })
    return
  }

  if (type == ContentType.toolCall) {
    const { id, name, ...rest } = attributes
    if (!id) baseNodeError(errors.toolCallTagWithoutId, node)
    if (!name) baseNodeError(errors.toolCallWithoutName, node)

    addContent({
      node,
      content: {
        ...rest,
        type: ContentType.toolCall,
        toolCallId: String(id),
        toolName: String(name),
        toolArguments: {}, // TODO: Issue for a future PR
      },
    })
    return
  }

  baseNodeError(errors.invalidContentType(type), node)
}
