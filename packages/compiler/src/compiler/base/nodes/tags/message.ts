import type { ToolCallReference } from '$compiler/compiler/types'
import { CUSTOM_MESSAGE_ROLE_ATTR, CUSTOM_MESSAGE_TAG } from '$compiler/constants'
import errors from '$compiler/error/errors'
import type { MessageTag } from '$compiler/parser/interfaces'
import {
  type AssistantMessage,
  type Message,
  type MessageContent,
  MessageRole,
  type SystemMessage,
  type ToolMessage,
  type UserMessage,
} from '$compiler/types'

import type { CompileNodeContext } from '../../types'

export async function compile(
  props: CompileNodeContext<MessageTag>,
  attributes: Record<string, unknown>,
) {
  const {
    node,
    scope,
    isInsideMessageTag,
    isInsideContentTag,
    resolveBaseNode,
    baseNodeError,
    groupContent,
    groupStrayText,
    popContent,
    popToolCalls,
    addMessage,
  } = props

  if (isInsideContentTag || isInsideMessageTag) {
    baseNodeError(errors.messageTagInsideMessage, node)
  }

  groupContent()

  let role = node.name as MessageRole
  if (node.name === CUSTOM_MESSAGE_TAG) {
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
      isInsideMessageTag: true,
      isInsideContentTag,
    })
  }

  groupStrayText()
  const messageContent = popContent()
  const toolCalls = popToolCalls()

  const message = buildMessage(props as CompileNodeContext<MessageTag>, {
    role,
    attributes,
    content: messageContent,
    toolCalls,
  })!
  addMessage(message)
}

type BuildProps<R extends MessageRole> = {
  role: R
  attributes: Record<string, unknown>
  content: R extends MessageRole.user ? MessageContent[] : string
  toolCalls: ToolCallReference[]
}

function buildMessage<R extends MessageRole>(
  { node, baseNodeError }: CompileNodeContext<MessageTag>,
  { role, attributes, content, toolCalls }: BuildProps<R>,
): Message | undefined {
  if (role !== MessageRole.assistant) {
    toolCalls.forEach(({ node: toolNode }) => {
      baseNodeError(errors.invalidToolCallPlacement, toolNode)
    })
  }

  if (role === MessageRole.system) {
    return {
      ...attributes,
      role,
      content,
    } as SystemMessage
  }

  if (role === MessageRole.user) {
    return {
      ...attributes,
      role,
      name: attributes.name ? String(attributes.name) : undefined,
      content,
    } as UserMessage
  }

  if (role === MessageRole.assistant) {
    return {
      ...attributes,
      role,
      toolCalls: toolCalls.map(({ value }) => value),
      content,
    } as AssistantMessage
  }

  if (role === MessageRole.tool) {
    if (attributes.id === undefined) {
      baseNodeError(errors.toolMessageWithoutId, node)
    }

    return {
      role,
      content,
    } as ToolMessage
  }

  baseNodeError(errors.invalidMessageRole(role), node)
}
