import {
  Message,
  MessageRole,
  MessageContent,
  ToolCall,
} from '../../legacyCompiler'
import { findAndExtractFileContent } from './content/file'
import { findAndExtractImageContent } from './content/image'
import { findAndExtractTextContent } from './content/text'
import { findAndExtractToolCallContent } from './content/toolCall'
import { findAndExtractReasoningContent } from './content/reasoning'
import { caseVariations, extract, extractValue, omitUndefined } from './utils'
import { findAndExtractToolResultContent } from './content/toolResult'

/**
 * Given any object ressembling a message list, it will try its best to translate it
 * to our own message format.
 *
 * @param messages - The messages object to translate. From a string to an object array.
 * @param messageType - The type of message to translate. This will determine the role of the message if information is missing.
 */
export function translateMessages(
  messages: unknown,
  messageType: 'input' | 'output' = 'input',
): Message[] {
  const defaultRole = messageType === 'input' ? MessageRole.system : MessageRole.assistant // prettier-ignore

  if (typeof messages === 'string') {
    // We assume this is either just the prompt or just the response
    return [
      {
        role: defaultRole,
        content: [
          {
            type: 'text',
            text: messages,
          },
        ],
      } as unknown as Message, // I hate this, we must improve our message types
    ]
  }

  if (!Array.isArray(messages)) {
    // We assume it's an object from either the prompt object or response object
    return [
      {
        role: defaultRole,
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages),
          },
        ],
      } as unknown as Message,
    ]
  }

  return messages
    .flat()
    .map((message) => translateMessage(message, defaultRole))
}

function translateMessage(message: unknown, defaultRole: MessageRole): Message {
  if (typeof message === 'string') {
    return {
      role: MessageRole.assistant,
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    } as unknown as Message
  }

  if (Array.isArray(message)) {
    // Not possible, since we are already flattening the messages
    throw new Error('Invalid message content')
  }

  const { role, name, content, parts, output } = extract(
    ['role', 'name', 'content', 'parts', 'output'],
    message,
  )

  const toolCallsValue = extractValue(caseVariations('tool calls'), message)

  const allContent = [
    ...(content ? translateContent(content) : []),
    ...(parts ? translateContent(parts) : []),
    ...(output ? translateContent(output) : []),
    ...(toolCallsValue && Array.isArray(toolCallsValue)
      ? toolCallsValue.map(findAndExtractToolCallContent)
      : []),
  ].filter((item) => item !== undefined) as MessageContent[]

  const [otherContent, toolCalls] = allContent.reduce(
    (acc, item) => {
      if (!item) return acc
      if (item.type === 'tool-call') {
        return [
          acc[0],
          [
            ...acc[1],
            {
              id: item.toolCallId,
              name: item.toolName,
              arguments: item.args,
            } as ToolCall,
          ],
        ]
      }

      return [[...acc[0], item], acc[1]]
    },
    [[], []] as [MessageContent[], ToolCall[]],
  )

  return {
    ...omitUndefined({ name }),
    role: translateRole(role, defaultRole),
    content: otherContent,
    ...(toolCalls.length ? { toolCalls } : {}),
  } as Message
}

function translateContent(content: unknown): MessageContent[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }

  if (Array.isArray(content)) return content.map(translateContent).flat()

  if (typeof content === 'object' && content !== null) {
    const item = translateContentItem(content)
    if (item) return [item]
  }

  // Not supported (?)
  return []
}

function translateRole(role: unknown, defaultRole: MessageRole): MessageRole {
  if (typeof role !== 'string') return defaultRole

  if (['system', 'developer'].includes(role)) return MessageRole.system
  if (['user'].includes(role)) return MessageRole.user
  if (['assistant', 'model'].includes(role)) return MessageRole.assistant
  if (['tool'].includes(role)) return MessageRole.tool

  return defaultRole
}

function translateContentItem(item: unknown): MessageContent | undefined {
  if (typeof item === 'string') {
    return { type: 'text', text: item }
  }

  if (Array.isArray(item)) {
    // Not possible, since we are already flattening the content
    throw new Error('Invalid content item')
  }

  if (item === null || typeof item !== 'object') {
    // Not supported (?)
    throw new Error(`Unknown content item: ${JSON.stringify(item)}`)
  }

  // We verified it's an object, so we can cast it to a record
  const part = item as Record<string, unknown>

  const textPart = findAndExtractTextContent(part)
  if (textPart) return textPart

  const imagePart = findAndExtractImageContent(part)
  if (imagePart) return imagePart

  const filePart = findAndExtractFileContent(part)
  if (filePart) return filePart

  const reasoningPart = findAndExtractReasoningContent(part)
  if (reasoningPart) return reasoningPart

  const toolCallPart = findAndExtractToolCallContent(part)
  if (toolCallPart) return toolCallPart

  const toolResultPart = findAndExtractToolResultContent(part)
  if (toolResultPart) return toolResultPart

  // Not supported (?)
  return undefined
}
