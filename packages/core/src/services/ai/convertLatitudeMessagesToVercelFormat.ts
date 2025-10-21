import {
  ModelMessage,
  TextPart,
  ImagePart,
  FilePart,
  ToolCallPart,
  ToolResultPart,
  UserModelMessage,
  SystemModelMessage,
  ToolModelMessage,
  AssistantModelMessage,
  JSONValue,
} from 'ai'

import {
  Message,
  MessageRole,
  TextContent,
  ImageContent,
  FileContent,
  ToolRequestContent,
  ToolContent,
  AssistantMessage,
  MessageContent,
} from '@latitude-data/constants/legacyCompiler'

import {
  extractMessageMetadata,
  getProviderMetadataKey,
} from './providers/rules/providerMetadata'
import { Providers } from '@latitude-data/constants'
import { captureMessage } from '../../utils/datadogCapture'

type VercelAssistantContent = AssistantModelMessage['content']
type ReasoningPart = Extract<
  Exclude<VercelAssistantContent, string>[number],
  { type: 'reasoning' }
>

function convertToolResultOutput(
  content: ToolContent,
): ToolResultPart['output'] {
  if (typeof content.result === 'string') {
    return {
      type: content.isError ? 'error-text' : 'text',
      value: content.result,
    }
  } else if (
    Array.isArray(content.result) &&
    content.result.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        ('text' in item || ('data' in item && 'mediaType' in item)),
    )
  ) {
    return {
      type: 'content',
      value: content.result as Array<
        | { type: 'text'; text: string }
        | { type: 'media'; data: string; mediaType: string }
      >,
    }
  } else if (content.isError) {
    return { type: 'error-json', value: content.result as JSONValue }
  } else {
    return { type: 'json', value: content.result as JSONValue }
  }
}

function convertBaseContent(
  content: MessageContent,
): TextPart | ImagePart | FilePart | null {
  switch (content.type) {
    case 'text': {
      const c = content as TextContent
      return { type: 'text', text: c.text ?? '' }
    }
    case 'image': {
      const c = content as ImageContent
      return { type: 'image', image: c.image }
    }
    case 'file': {
      const c = content as FileContent
      return { type: 'file', data: c.file, mediaType: c.mimeType }
    }
    default:
      return null
  }
}

function convertUserContent(
  content: MessageContent,
): TextPart | ImagePart | FilePart | null {
  return convertBaseContent(content)
}

function convertAssistantContent(content: MessageContent) {
  switch (content.type) {
    case 'text': {
      return { type: 'text', text: content.text ?? '' } satisfies TextPart
    }
    case 'file': {
      return {
        type: 'file',
        data: content.file,
        mediaType: content.mimeType,
      } satisfies FilePart
    }
    case 'reasoning': {
      return { type: 'reasoning', text: content.text } satisfies ReasoningPart
    }
    case 'redacted-reasoning': {
      return {
        type: 'reasoning',
        text: `[REDACTED] ${content.data}`,
      } satisfies ReasoningPart
    }
    case 'tool-call': {
      const c = content as ToolRequestContent
      return {
        type: 'tool-call',
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.args,
      } satisfies ToolCallPart
    }
    case 'tool-result': {
      return {
        type: 'tool-result',
        toolCallId: content.toolCallId,
        toolName: content.toolName,
        output: convertToolResultOutput(content),
      } satisfies ToolResultPart
    }
    default:
      return null
  }
}

function filterEmptyContent(content: Exclude<Message['content'], string>) {
  return content.filter((part) => {
    if (part.type === 'text') {
      return part.text && part.text.length > 0
    }

    return true
  })
}

// Note: currently only filtering empty assistant messages
// produced by aborting the request before it hits the provider
function filterEmptyMessages(messages: Message[]) {
  return messages.filter((message) => {
    if (message.role !== 'assistant') return true

    if (typeof message.content === 'string') {
      if (message.content.length > 0) return true
    }

    if (Array.isArray(message.content)) {
      message.content = filterEmptyContent(message.content)
      if (message.content.length > 0) return true
    }

    if (message.toolCalls) {
      if (message.toolCalls.length > 0) return true
    }

    return false
  })
}

export function convertLatitudeMessagesToVercelFormat({
  messages,
  provider,
}: {
  messages: Message[]
  provider: Providers
}): ModelMessage[] {
  return filterEmptyMessages(messages).map((msg) => {
    const extracted = extractMessageMetadata({ message: msg, provider })
    const key = getProviderMetadataKey(provider)
    const raw = extracted.providerOptions?.[key] ?? {}

    // Ensure correct type for providerOptions
    const msgMetadata =
      Object.keys(raw).length > 0
        ? { [key]: raw as Record<string, JSONValue> }
        : {}

    switch (msg.role) {
      case MessageRole.system: {
        const content =
          typeof msg.content === 'string'
            ? [{ type: 'text', text: msg.content }]
            : msg.content
        const textContent = content
          .map((c) =>
            c.type === 'text' ? ((c as TextContent).text ?? '') : '',
          )
          .join('\n')

        const converted: SystemModelMessage = {
          role: 'system',
          content: textContent,
        }

        if (Object.keys(msgMetadata).length > 0) {
          converted.providerOptions = msgMetadata
        }

        return converted
      }

      case MessageRole.user: {
        const parts = (msg.content as MessageContent[])
          .map(convertUserContent)
          .filter((c): c is TextPart | ImagePart | FilePart => c !== null)

        const content: UserModelMessage['content'] =
          parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts

        const converted: UserModelMessage = { role: 'user', content }

        if (Object.keys(msgMetadata).length > 0) {
          converted.providerOptions = msgMetadata
        }

        return converted
      }

      case MessageRole.assistant: {
        const assistant = msg as AssistantMessage
        let parts: Exclude<VercelAssistantContent, string> = []

        if (typeof assistant.content === 'string') {
          parts.push({ type: 'text', text: assistant.content })
        } else if (Array.isArray(assistant.content)) {
          parts = assistant.content
            .map(convertAssistantContent)
            .filter((c) => c !== null)
        }

        // TODO: If we see all providers are containing all tool calls within the content, we can go a step further and remove the toolCalls property as its not needed anymore
        if (assistant.toolCalls) {
          const assistantToolCallsNotInContent = assistant.toolCalls.filter(
            (t) =>
              !parts.some(
                (p) => p.type === 'tool-call' && p.toolCallId === t.id,
              ),
          )
          if (assistantToolCallsNotInContent.length > 0) {
            const additionalToolCallsToAdd =
              assistantToolCallsNotInContent.map<ToolCallPart>((t) => ({
                type: 'tool-call',
                toolCallId: t.id,
                toolName: t.name,
                input: t.arguments,
              }))
            parts.push(...additionalToolCallsToAdd)
            captureMessage(
              'Additional tool calls added to assistant message',
              'warning',
            )
          }
        }

        const converted: AssistantModelMessage = {
          role: 'assistant',
          content: parts,
        }

        if (Object.keys(msgMetadata).length > 0) {
          converted.providerOptions = msgMetadata
        }

        return converted
      }

      case MessageRole.tool: {
        const toolContent = (msg.content as (MessageContent | ToolResultPart)[])
          .map((c) =>
            'type' in c
              ? convertAssistantContent(c as MessageContent)
              : (c as ToolResultPart),
          )
          .filter(
            (c): c is ToolResultPart => c !== null && c.type === 'tool-result',
          )

        const converted: ToolModelMessage = {
          role: 'tool',
          content: toolContent,
        }

        if (Object.keys(msgMetadata).length > 0) {
          converted.providerOptions = msgMetadata
        }

        return converted
      }

      default:
        throw new Error(`Unknown role: ${(msg as Message).role}`)
    }
  })
}
