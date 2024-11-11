import { CUSTOM_MESSAGE_ROLE_ATTR, TAG_NAMES } from '$promptl/constants'
import errors from '$promptl/error/errors'
import { MessageTag, TemplateNode } from '$promptl/parser/interfaces'
import {
  ContentType,
  Message,
  MessageContent,
  MessageRole,
} from '$promptl/types'

import { CompileNodeContext } from '../../types'

export async function compile(
  props: CompileNodeContext<MessageTag>,
  attributes: Record<string, unknown>,
) {
  const {
    node,
    scope,
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    resolveBaseNode,
    baseNodeError,
    groupContent,
    groupStrayText,
    popContent,
    addMessage,
  } = props

  if (isInsideContentTag || isInsideMessageTag) {
    baseNodeError(errors.messageTagInsideMessage, node)
  }

  groupContent()

  let role = node.name as MessageRole
  if (node.name === TAG_NAMES.message) {
    if (attributes[CUSTOM_MESSAGE_ROLE_ATTR] === undefined) {
      baseNodeError(errors.messageTagWithoutRole, node)
    }
    role = attributes[CUSTOM_MESSAGE_ROLE_ATTR] as MessageRole
    delete attributes[CUSTOM_MESSAGE_ROLE_ATTR]
  }

  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideStepTag,
      isInsideMessageTag: true,
      isInsideContentTag,
    })
  }

  groupStrayText()
  const content = popContent()

  const message = buildMessage(props as CompileNodeContext<MessageTag>, {
    role,
    attributes,
    content,
  })!
  addMessage(message)
}

type BuildProps<R extends MessageRole> = {
  role: R
  attributes: Record<string, unknown>
  content: { node?: TemplateNode; content: MessageContent }[]
}

function buildMessage<R extends MessageRole>(
  { node, baseNodeError }: CompileNodeContext<MessageTag>,
  { role, attributes, content }: BuildProps<R>,
): Message | undefined {
  if (!Object.values(MessageRole).includes(role)) {
    baseNodeError(errors.invalidMessageRole(role), node)
  }

  if (role !== MessageRole.assistant) {
    content.forEach((item) => {
      if (item.content.type === ContentType.toolCall) {
        baseNodeError(errors.invalidToolCallPlacement, item.node ?? node)
      }
    })
  }

  const message = {
    ...attributes,
    role,
    content: content.map((item) => item.content),
  } as Message

  if (role === MessageRole.user) {
    message.name = attributes.name ? String(attributes.name) : undefined
  }

  if (role === MessageRole.tool) {
    if (attributes.id === undefined) {
      baseNodeError(errors.toolMessageWithoutId, node)
    }

    message.toolId = String(attributes.id)
  }

  return message
}
