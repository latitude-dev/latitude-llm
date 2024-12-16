import {
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
    }).experimental_providerMetadata ?? {}

  return content.flatMap((content) => {
    const extracted = extractContentMetadata({ content, provider })
    // @ts-expect-error - metadata key can be not present
    const metadata = (extracted.experimental_providerMetadata ??
      {}) as ProviderMetadata
    const baseMsg = { role: message.role, content: content.text }

    if (!Object.keys(metadata).length && !Object.keys(msgMetadata).length) {
      return baseMsg
    }

    const key = getProviderMetadataKey(provider)

    return {
      ...baseMsg,
      experimental_providerMetadata: {
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
        experimental_providerMetadata: messageMetadata,
      },
    ]
  }

  return content.map((contentItem) => {
    const extracted = extractContentMetadata({ content: contentItem, provider })
    if (!messageMetadata) return extracted

    // @ts-expect-error - metadata key can be not present
    const contentMetadata = (extracted.experimental_providerMetadata ??
      {}) as ProviderMetadata

    return {
      ...extracted,
      experimental_providerMetadata: {
        [key]: {
          ...(messageMetadata?.[key] || {}),
          ...(contentMetadata?.[key] || {}),
        },
      },
    }
  })
}

function adaptContentFields({ content }: { content: Message['content'] }) {
  if (typeof content === 'string') return content

  return content.map((c) => {
    switch (c.type) {
      case ContentType.file: {
        const adaptedContent = {
          ...c,
          data: (c as any)['file'] as FilePart['data'],
        }

        delete (adaptedContent as any)['file']

        return adaptedContent
      }

      case ContentType.toolCall: {
        const adaptedContent = {
          ...c,
          args: (c as any)['toolArguments'] as ToolCallPart['args'],
        }

        delete (adaptedContent as any)['toolArguments']

        return adaptedContent
      }

      default:
        return c
    }
  })
}

export function vercelSdkRules(
  rules: AppliedRules,
  provider: Providers,
): AppliedRules {
  const messages = rules.messages.flatMap((message) => {
    if (message.role === 'system') {
      return flattenSystemMessage({ message, provider })
    }

    const extracted = extractMessageMetadata({
      message: message,
      provider: provider,
    })

    let content = adaptContentFields({
      content: extracted.content,
    }) as unknown as Message['content']

    content = groupContentMetadata({
      content: content,
      provider: provider,
      messageMetadata: extracted.experimental_providerMetadata,
    }) as unknown as Message['content']

    return [{ ...extracted, content } as Message]
  }) as Message[]

  return { ...rules, messages }
}
