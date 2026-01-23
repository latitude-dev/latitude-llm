import { ATTRIBUTES } from '@latitude-data/constants'
import {
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  ToolCallContent,
  ToolMessage,
} from 'promptl-ai'
import { extractAttribute } from '../../../../../../../constants/src/tracing/attributes'
import { CompletionSpanMetadata, SpanAttribute } from '../../../../../constants'
import { UnprocessableEntityError } from '../../../../../lib/errors'
import { Result, TypedResult } from '../../../../../lib/Result'
import { setField, toCamelCase, validateUndefineds } from '../../shared'

function convertToolCalls(
  raws: Record<string, unknown>[],
): TypedResult<ToolCallContent[]> {
  const toolCalls: ToolCallContent[] = []

  try {
    for (const raw of raws) {
      const toolCall = toCamelCase(raw)

      // OpenAI Completions
      if (toolCall.function && typeof toolCall.function === 'object') {
        const func = toolCall.function as Record<string, unknown>
        toolCalls.push({
          type: ContentType.toolCall,
          toolCallId: String(toolCall.id || ''),
          toolName: String(func.name || ''),
          toolArguments: JSON.parse(String(func.arguments || '{}')),
        })
      }
      // The rest...
      else {
        toolCalls.push({
          type: ContentType.toolCall,
          toolCallId: String(toolCall.callId || toolCall.toolCallId || toolCall.toolUseId || toolCall.id || ''), // prettier-ignore
          toolName: String(toolCall.toolName || toolCall.name || ''),
          toolArguments: JSON.parse(String( toolCall.toolArguments || toolCall.arguments  || toolCall.input || '{}')), // prettier-ignore
        })
      }
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid completion tool calls'),
    )
  }

  return Result.ok(toolCalls)
}

type ToolResultContent = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError: boolean
}

function convertToolResults(
  raws: Record<string, unknown>[],
): TypedResult<ToolResultContent[]> {
  const toolResults: ToolResultContent[] = []

  try {
    for (const raw of raws) {
      const toolResult = toCamelCase(raw)

      toolResults.push({
        type: 'tool-result',
        toolCallId: String(toolResult.callId || toolResult.toolCallId || toolResult.toolUseId || toolResult.id || ''), // prettier-ignore
        toolName: String(toolResult.toolName || toolResult.name || ''),
        result: toolResult.result || toolResult.output || {},
        isError: Boolean(toolResult.isError || false),
      })
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid completion tool results'),
    )
  }

  return Result.ok(toolResults)
}

const CONTENT_TYPE_TEXT = toCamelCase(ContentType.text)
const CONTENT_TYPE_REASONING = toCamelCase('reasoning')
const CONTENT_TYPE_REDACTED_REASONING = toCamelCase('redacted-reasoning')
const CONTENT_TYPE_IMAGE = toCamelCase(ContentType.image)
const CONTENT_TYPE_FILE = toCamelCase(ContentType.file)
const CONTENT_TYPE_TOOL_CALL = toCamelCase(ContentType.toolCall)
const CONTENT_TYPE_TOOL_RESULT = toCamelCase('tool-result')

function convertContentType(type: string): TypedResult<ContentType> {
  switch (toCamelCase(type)) {
    case CONTENT_TYPE_TEXT:
    case 'output_text':
      return Result.ok(ContentType.text)
    case CONTENT_TYPE_REASONING:
      return Result.ok('reasoning' as ContentType)
    case CONTENT_TYPE_REDACTED_REASONING:
      return Result.ok('redacted-reasoning' as ContentType)
    case CONTENT_TYPE_IMAGE:
      return Result.ok(ContentType.image)
    case CONTENT_TYPE_FILE:
      return Result.ok(ContentType.file)
    case CONTENT_TYPE_TOOL_CALL:
    case 'toolUse':
    case 'function_call':
      return Result.ok(ContentType.toolCall)
    case CONTENT_TYPE_TOOL_RESULT:
    case 'function_call_result':
      return Result.ok('tool-result' as ContentType)
    default:
      return Result.error(new UnprocessableEntityError('Invalid content type'))
  }
}

function convertMessageContent(
  content: unknown | Record<string, unknown>[],
): TypedResult<MessageContent[]> {
  if (typeof content === 'string') {
    return Result.ok([{ type: ContentType.text, text: content }])
  }

  if (Array.isArray(content)) {
    const result: MessageContent[] = []

    for (const raw of content) {
      const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!payload || typeof payload !== 'object') {
        return Result.error(
          new UnprocessableEntityError('Invalid message content'),
        )
      }

      const item = toCamelCase(raw as Record<string, unknown>)

      if (!item.type) {
        return Result.error(
          new UnprocessableEntityError('Content type is required'),
        )
      }
      const convertingt = convertContentType(String(item.type))
      if (convertingt.error) return Result.error(convertingt.error)
      const type = convertingt.value

      switch (type) {
        case ContentType.text:
          result.push({
            type: ContentType.text,
            text: String(item.text || ''),
          })
          break
        case 'reasoning' as ContentType:
          result.push({
            type: 'reasoning',
            text: String(item.text || ''),
          } as unknown as MessageContent)
          break
        case 'redacted-reasoning' as ContentType:
          result.push({
            type: 'redacted-reasoning',
            data: String(item.data || ''),
          } as unknown as MessageContent)
          break
        case ContentType.image:
          result.push({
            type: ContentType.image,
            image: String(item.image || ''),
          })
          break
        case ContentType.file:
          result.push({
            type: ContentType.file,
            file: String(item.file || ''),
            mimeType: String(item.mimeType || ''),
          })
          break
        case ContentType.toolCall:
          {
            const converting = convertToolCalls([item])
            if (converting.error) return Result.error(converting.error)
            result.push(...converting.value)
          }
          break
        case 'tool-result' as ContentType:
          {
            const converting = convertToolResults([item])
            if (converting.error) return Result.error(converting.error)
            result.push(...(converting.value as unknown as MessageContent[]))
          }
          break
      }
    }

    return Result.ok(result)
  }

  try {
    return Result.ok([
      { type: ContentType.text, text: JSON.stringify(content) },
    ])
  } catch {
    return Result.error(new UnprocessableEntityError('Invalid message content'))
  }
}

const MESSAGE_ROLE_SYSTEM = toCamelCase(MessageRole.system)
const MESSAGE_ROLE_USER = toCamelCase(MessageRole.user)
const MESSAGE_ROLE_ASSISTANT = toCamelCase(MessageRole.assistant)
const MESSAGE_ROLE_DEVELOPER = toCamelCase(MessageRole.developer)
const MESSAGE_ROLE_TOOL = toCamelCase(MessageRole.tool)

function convertMessageRole(role: string): TypedResult<MessageRole> {
  switch (toCamelCase(role)) {
    case MESSAGE_ROLE_SYSTEM:
      return Result.ok(MessageRole.system)
    case MESSAGE_ROLE_USER:
      return Result.ok(MessageRole.user)
    case MESSAGE_ROLE_ASSISTANT:
      return Result.ok(MessageRole.assistant)
    case MESSAGE_ROLE_DEVELOPER:
      return Result.ok(MessageRole.developer)
    case MESSAGE_ROLE_TOOL:
      return Result.ok(MessageRole.tool)
    default:
      // Default to assistant for unknown roles (common in completion responses)
      return Result.ok(MessageRole.assistant)
  }
}

function convertMessages(
  raws: Record<string, unknown>[],
): TypedResult<Message[]> {
  const messages: Message[] = []

  try {
    for (const raw of raws) {
      const message = toCamelCase(raw)

      if (!message.role) {
        return Result.error(
          new UnprocessableEntityError('Message role is required'),
        )
      }
      const convertingr = convertMessageRole(String(message.role))
      if (convertingr.error) return Result.error(convertingr.error)
      const role = convertingr.value

      if (!message.content && message.content !== '') {
        return Result.error(
          new UnprocessableEntityError('Message content is required'),
        )
      }
      const convertingc = convertMessageContent(message.content)
      if (convertingc.error) return Result.error(convertingc.error)
      const content = convertingc.value

      if (message.toolCalls && Array.isArray(message.toolCalls)) {
        const converting = convertToolCalls(message.toolCalls)
        if (converting.error) return Result.error(converting.error)
        content.push(...converting.value)
      }

      if (role !== MessageRole.tool) {
        messages.push({ role, content } as Message)
      } else {
        const toolName = String(message.toolName || '')
        const toolId = String(message.toolId || message.toolCallId || message.toolUseId || '') // prettier-ignore
        const isError = String(message.isError || '')
        messages.push({ role, content, toolName, toolId, isError } as ToolMessage) // prettier-ignore
      }
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid completion messages'),
    )
  }

  return Result.ok(messages)
}

function extractMessages(
  attributes: Record<string, SpanAttribute>,
  prefix: string,
): TypedResult<Message[]> {
  const messages: Record<string, unknown>[] = []

  try {
    for (const key in attributes) {
      if (!key.startsWith(prefix)) continue
      const field = key.replace(prefix + '.', '')
      setField(messages, field, attributes[key])
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid completion messages'),
    )
  }

  if (!validateUndefineds(messages)) {
    return Result.error(
      new UnprocessableEntityError('Invalid completion messages'),
    )
  }

  return convertMessages(messages)
}

/**
 * Extracts messages from OpenInference indexed attributes format.
 * OpenInference uses `llm.{input/output}_messages.{i}.message.{role,content}` format
 * which creates a nested `.message` structure that needs to be unwrapped.
 */
function extractOpenInferenceMessages(
  attributes: Record<string, SpanAttribute>,
  prefix: string,
): TypedResult<Message[]> {
  const rawMessages: Record<string, unknown>[] = []

  try {
    for (const key in attributes) {
      if (!key.startsWith(prefix)) continue
      const field = key.replace(prefix + '.', '')
      setField(rawMessages, field, attributes[key])
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid OpenInference messages'),
    )
  }

  if (!validateUndefineds(rawMessages)) {
    return Result.error(
      new UnprocessableEntityError('Invalid OpenInference messages'),
    )
  }

  // Unwrap the nested `.message` structure from OpenInference format
  // e.g., { message: { role: "user", content: "..." } } -> { role: "user", content: "..." }
  const messages = rawMessages.map((item) => {
    if (item && typeof item === 'object' && 'message' in item) {
      return item.message as Record<string, unknown>
    }
    return item
  })

  return convertMessages(messages)
}

export function extractInput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['input']> {
  const messages: Message[] = []

  const system = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.LATITUDE.request.systemPrompt],
  })

  if (system) {
    messages.push({
      role: MessageRole.system,
      content: [{ type: ContentType.text, text: system }],
    })
  }

  for (const key of [
    ATTRIBUTES.LATITUDE.request.messages,
    ATTRIBUTES.OPENINFERENCE.llm.inputMessages,
    ATTRIBUTES.AI_SDK.prompt.messages,
  ]) {
    const attribute = String(attributes[key] ?? '')
    if (!attribute) continue
    try {
      const payload = JSON.parse(attribute)
      if (!Array.isArray(payload)) {
        return Result.error(
          new UnprocessableEntityError('Invalid input messages'),
        )
      }

      // Note: messages are already in PromptL format
      if (key === ATTRIBUTES.LATITUDE.request.messages) {
        return Result.ok(payload as Message[])
      }

      const converting = convertMessages(payload)
      if (converting.error) return Result.error(converting.error)
      return Result.ok([...messages, ...converting.value])
    } catch {
      return Result.error(
        new UnprocessableEntityError('Invalid input messages'),
      )
    }
  }

  for (const key of [
    ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.prompt._root,
    ATTRIBUTES.OPENINFERENCE.llm.prompts,
  ]) {
    const extracting = extractMessages(attributes, key)
    if (extracting.error) return Result.error(extracting.error)
    if (extracting.value.length < 1) continue
    return Result.ok([...messages, ...extracting.value])
  }

  // OpenInference indexed format: llm.input_messages.{i}.message.{role,content}
  const extractingOpenInference = extractOpenInferenceMessages(
    attributes,
    ATTRIBUTES.OPENINFERENCE.llm.inputMessages,
  )
  if (extractingOpenInference.error)
    return Result.error(extractingOpenInference.error)
  if (extractingOpenInference.value.length > 0) {
    return Result.ok([...messages, ...extractingOpenInference.value])
  }

  return Result.ok(messages)
}

export function extractOutput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['output']> {
  for (const key of [
    ATTRIBUTES.LATITUDE.response.messages,
    ATTRIBUTES.OPENINFERENCE.llm.outputMessages,
  ]) {
    const attribute = String(attributes[key] ?? '')
    if (!attribute) continue
    try {
      const payload = JSON.parse(attribute)
      if (!Array.isArray(payload)) {
        return Result.error(
          new UnprocessableEntityError('Invalid output messages'),
        )
      }

      // Note: messages are already in PromptL format
      if (key === ATTRIBUTES.LATITUDE.response.messages) {
        return Result.ok(payload as Message[])
      }

      const converting = convertMessages(payload)
      if (converting.error) return Result.error(converting.error)
      return Result.ok(converting.value)
    } catch {
      return Result.error(
        new UnprocessableEntityError('Invalid output messages'),
      )
    }
  }

  for (const key of [
    ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.completion._root,
    ATTRIBUTES.OPENINFERENCE.llm.completions,
  ]) {
    const extracting = extractMessages(attributes, key)
    if (extracting.error) return Result.error(extracting.error)
    if (extracting.value.length < 1) continue
    return Result.ok(extracting.value)
  }

  // OpenInference indexed format: llm.output_messages.{i}.message.{role,content}
  const extractingOpenInference = extractOpenInferenceMessages(
    attributes,
    ATTRIBUTES.OPENINFERENCE.llm.outputMessages,
  )
  if (extractingOpenInference.error)
    return Result.error(extractingOpenInference.error)
  if (extractingOpenInference.value.length > 0) {
    return Result.ok(extractingOpenInference.value)
  }

  const responseText = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.AI_SDK.response.text],
  })
  const responseObject = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.AI_SDK.response.object],
  })
  const responseToolCalls = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.AI_SDK.response.toolCalls],
  })

  if (responseText || responseObject || responseToolCalls) {
    const message: Message = { role: MessageRole.assistant, content: [] }

    if (responseText) {
      message.content.push({
        type: ContentType.text,
        text: responseText,
      })
    }

    if (responseObject) {
      message.content.push({
        type: ContentType.text,
        text: responseObject,
      })
    }

    if (responseToolCalls) {
      try {
        const payload = JSON.parse(responseToolCalls)
        if (!Array.isArray(payload)) {
          return Result.error(
            new UnprocessableEntityError('Invalid output tool calls'),
          )
        }

        const converting = convertToolCalls(payload)
        if (converting.error) return Result.error(converting.error)
        message.content.push(...converting.value)
      } catch {
        return Result.error(
          new UnprocessableEntityError('Invalid output tool calls'),
        )
      }
    }

    if (message.content.length > 0) return Result.ok([message])
  }

  return Result.ok([])
}
