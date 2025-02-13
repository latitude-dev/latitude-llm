import {
  AssistantMessage,
  MessageContent,
  ToolCall,
  ToolRequestContent,
  ToolContent,
  ToolMessage,
} from '@latitude-data/compiler'
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

  if (type === 'text' && data.toolCalls && data.toolCallResponses) {
    throw new Error(
      'A message cannot have both toolCalls and toolCallResponses',
    )
  }

  const toolCallResponses =
    type === 'text' ? (data.toolCallResponses ?? []) : []

  const text = data.text
  const object = type === 'object' ? data.object : undefined
  const toolCalls = type === 'text' ? (data.toolCalls ?? []) : []
  let content: MessageContent[] = []

  if (object) {
    content.push({
      type: 'text',
      text: objectToString(object),
    } as MessageContent)
  } else if (text !== undefined) {
    // Text can be empty string. We want to always at least generate
    // an empty text response
    content.push({
      type: 'text',
      text: text,
    } as MessageContent)
  }

  if (toolCalls.length > 0) {
    const toolContents = toolCalls.map((toolCall) => {
      return {
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments,
      } as ToolRequestContent
    })

    content = content.concat(toolContents)
  }

  if (toolCallResponses.length > 0) {
    const toolResponseContents = toolCallResponses.map((toolCallResponse) => {
      return {
        type: 'tool-result',
        toolCallId: toolCallResponse.id,
        toolName: toolCallResponse.name,
        result:
          typeof toolCallResponse.result === 'string'
            ? parseToolResponseResult(toolCallResponse.result)
            : toolCallResponse.result,
        isError: toolCallResponse.isError || false,
      }
    })

    content = content.concat(toolResponseContents as unknown as ToolContent[])
  }

  if (!content.length) return undefined

  if (toolCallResponses.length > 0) {
    return {
      role: 'tool',
      content,
    } as ToolMessage
  }

  return { role: 'assistant', content, toolCalls } as AssistantMessage
}

export type { ToolRequest }
