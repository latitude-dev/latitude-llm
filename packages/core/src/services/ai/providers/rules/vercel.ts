import type {
  ContentType,
  Message,
  SystemMessage,
  TextContent,
} from '@latitude-data/compiler'
import { FilePart, ToolCallPart } from 'ai'

import { Providers } from '../models'
import {
  extractContentMetadata,
  extractMessageMetadata,
  getProviderMetadataKey,
  type ProviderMetadata,
} from './providerMetadata'
import { AppliedRules } from './types'

function flattenSystemMessage({
  message,
  provider,
}: {
  message: SystemMessage
  provider: Providers
}): Message[] {
  const content = message.content as TextContent[] | string

  // NOTE: `applyAllRules` can be invoked multiple times
  // during a chain. if system message.content is already
  // a string we consider it already processed.
  if (typeof content === 'string') return [message]

  const msgMetadata =
    extractMessageMetadata({
      message,
      provider,
    }).providerOptions ?? {}

  return content.flatMap((content) => {
    const extracted = extractContentMetadata({ content, provider })
    // @ts-expect-error - metadata key can be not present
    const metadata = (extracted.providerOptions ?? {}) as ProviderMetadata
    const baseMsg = { role: message.role, content: content.text }

    if (!Object.keys(metadata).length && !Object.keys(msgMetadata).length) {
      return baseMsg
    }

    const key = getProviderMetadataKey(provider)

    return {
      ...baseMsg,
      providerOptions: {
        [key]: {
          ...(msgMetadata?.[key] || {}),
          ...(metadata?.[key] || {}),
        },
      },
    }
  }) as unknown as Message[]
}

function groupContentMetadata({
  content,
  provider,
  messageMetadata,
}: {
  content: Message['content']
  provider: Providers
  messageMetadata?: ProviderMetadata
}) {
  const key = getProviderMetadataKey(provider)

  if (typeof content === 'string') {
    const baseMsg = { type: 'text' as ContentType, text: content }
    if (!messageMetadata) return [baseMsg]

    return [
      {
        ...baseMsg,
        providerOptions: messageMetadata,
      },
    ]
  }

  return content.map((contentItem) => {
    const extracted = extractContentMetadata({ content: contentItem, provider })
    if (!messageMetadata) return extracted

    // @ts-expect-error - metadata key can be not present
    const contentMetadata = (extracted.providerOptions ??
      {}) as ProviderMetadata

    return {
      ...extracted,
      providerOptions: {
        [key]: {
          ...(messageMetadata?.[key] || {}),
          ...(contentMetadata?.[key] || {}),
        },
      },
    }
  })
}

function adaptContentFields({
  toolResultInMessage,
  content,
}: {
  content: Message['content']
  toolResultInMessage:
    | {
        toolCallId: string
        toolName: string
      }
    | undefined
}) {
  if (typeof content === 'string') return content

  return content.map((c) => {
    if (toolResultInMessage && c.type === 'text') {
      const toolCallId = toolResultInMessage.toolCallId
      const toolName = toolResultInMessage.toolName
      return {
        type: 'tool-result',
        toolCallId,
        toolName,
        result: c.text,
      }
    }

    switch (c.type) {
      case 'file': {
        const adaptedContent = {
          ...c,
          data: (c as any)['file'] as FilePart['data'],
        } as FilePart

        delete (adaptedContent as any)['file']

        return adaptedContent
      }

      case 'tool-call': {
        const adaptedContent = {
          ...c,
          args: c.args || ((c as any)['toolArguments'] as ToolCallPart['args']),
        } as ToolCallPart

        delete (adaptedContent as any)['toolArguments']

        return adaptedContent
      }

      default:
        return c
    }
  })
}

/**
 * Extracts the toolCallId and toolName from
 * promptl-ai messages. Old compiler messages don't have this.
 */
function extractPromptlToolInfo({ message }: { message: Message }) {
  const hasToolCallId = 'toolId' in message
  const hasToolName = 'toolName' in message
  if (!hasToolCallId || !hasToolName) return undefined

  // Only 'tool' promptl messages have this
  const toolCallId = message.toolId as string
  const toolName = message.toolName as string

  return { toolCallId, toolName }
}

export function vercelSdkRules(
  rules: AppliedRules,
  provider: Providers,
): AppliedRules {
  const messages = rules.messages.flatMap((message) => {
    if (message.role === 'system') {
      return flattenSystemMessage({ message, provider })
    }

    const toolResultInMessage = extractPromptlToolInfo({ message })
    const extracted = extractMessageMetadata({
      message: message,
      provider: provider,
    })

    let content = adaptContentFields({
      toolResultInMessage,
      content: extracted.content,
    }) as unknown as Message['content']

    content = groupContentMetadata({
      content: content,
      provider: provider,
      messageMetadata: extracted.providerOptions,
    }) as unknown as Message['content']

    return [{ ...extracted, content } as Message]
  }) as Message[]

  return { ...rules, messages }
}
