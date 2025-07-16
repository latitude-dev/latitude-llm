import {
  AssistantMessage,
  MessageContent,
  ToolCall,
  ToolRequestContent,
  ToolContent,
  MessageRole,
  ToolMessage,
} from '@latitude-data/constants/legacyCompiler'
import { ToolCallContent as ToolRequest } from 'promptl-ai'
import { StreamType, ToolCallResponse } from './index'

type BuildMessageParams<T extends StreamType> = T extends 'object'
  ? {
      type: 'object'
      data?: {
        object: any | undefined
        text: string | undefined
      }
    }
  : {
      type: 'text'
      data?: {
        text: string | undefined
        reasoning?: string | undefined
        toolCalls?: ToolCall[]
        toolCallResponses?: ToolCallResponse[]
      }
    }

function parseToolResponseResult(result: string) {
  try {
    return JSON.parse(result)
  } catch (error) {
    return { result }
  }
}

const DEFAULT_OBJECT_TO_STRING_MESSAGE =
  'Error: Provider returned an object that could not be stringified'

export function objectToString(
  object: any,
  message = DEFAULT_OBJECT_TO_STRING_MESSAGE,
) {
  try {
    if (!object) return ''

    return JSON.stringify(object, null, 2)
  } catch (error) {
    return message
  }
}

export function buildResponseMessage<T extends StreamType>({
  type,
  data,
}: BuildMessageParams<T>) {
  if (!data) return undefined
  if (
    'toolCallResponses' in data &&
    data.toolCallResponses &&
    data.toolCallResponses.length > 0
  ) {
    return buildToolResultMessage(data.toolCallResponses)
  }

  // @ts-expect-error - fix types
  return buildAssistantMessage<T>({ type, data })
}

function buildAssistantMessage<T extends StreamType>({
  type,
  data,
}: BuildMessageParams<T>) {
  const text = data!.text
  const object = type === 'object' ? data!.object : undefined
  const reasoning = type === 'text' ? data!.reasoning : undefined
  const toolCalls = type === 'text' ? (data!.toolCalls ?? []) : []
  let content: MessageContent[] = []

  if (toolCalls.length > 0) {
    content = addToolCallContents(toolCalls, content)
  }
  if (object) {
    content = addObjectContent(object, content)
  } else if (reasoning !== undefined && reasoning !== null) {
    content = addReasoningContent(reasoning, content)
  } else if (text !== undefined && text !== null) {
    content = addTextContent(text, content)
  }

  return {
    role: 'assistant',
    content,
    toolCalls,
  } as AssistantMessage
}

function addToolCallContents(toolCalls: ToolCall[], content: MessageContent[]) {
  const toolCallContents = toolCalls.map((toolCall) => {
    return {
      type: 'tool-call',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    } as ToolRequestContent
  })

  return [...content, ...toolCallContents]
}

function addObjectContent(
  object: any,
  content: MessageContent[],
): MessageContent[] {
  return [
    ...content,
    {
      type: 'text',
      text: objectToString(object),
    } as MessageContent,
  ]
}

function addReasoningContent(
  reasoning: string,
  content: MessageContent[],
): MessageContent[] {
  return [
    ...content,
    {
      type: 'reasoning',
      text: reasoning,
    } as MessageContent,
  ]
}

function addTextContent(
  text: string,
  content: MessageContent[],
): MessageContent[] {
  return [
    ...content,
    {
      type: 'text',
      text,
    } as MessageContent,
  ]
}

function buildToolResultMessage(toolCallResponses: ToolCallResponse[]) {
  const toolResults = toolCallResponses.map((toolCallResponse) => {
    return {
      type: 'tool-result',
      toolCallId: toolCallResponse.id,
      toolName: toolCallResponse.name,
      result:
        typeof toolCallResponse.result === 'string'
          ? parseToolResponseResult(toolCallResponse.result)
          : toolCallResponse.result,
      isError: toolCallResponse.isError || false,
    } as ToolContent
  })

  return {
    role: MessageRole.tool,
    content: toolResults,
  } as ToolMessage
}

export type { ToolRequest }
