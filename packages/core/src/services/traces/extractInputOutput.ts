import { ToolCallPart, ToolResultPart } from './types'
import { tryParseJSON } from './utils'
import {
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages.mjs'

type Message = {
  role: string
  content: unknown
}

enum ContentType {
  text = 'text',
  image = 'image',
  file = 'file',
  toolCall = 'tool-call',
  toolResult = 'tool-result',
  anthropicToolUse = 'tool_use', // Anthropic's name for tool calls
  anthropicToolResult = 'tool_result', // Anthropic's name for tool results
}

export function extractInputOutput(
  attrs: Record<string, string | number | boolean>,
) {
  const prompts: Array<Message> = []
  const completions: Array<Message> = []

  Object.entries(attrs).forEach(([key, value]) => {
    if (key.startsWith('gen_ai.prompt.') && key.endsWith('.content')) {
      const content = extractInputContents(attrs, key, value)
      if (content) {
        const index = parseInt(key.split('.')[2] as string)
        prompts[index] = content
      }
    }

    if (key.startsWith('gen_ai.completion.')) {
      const content = extractOutputContents(attrs, key, value)
      if (content) {
        const index = parseInt(key.split('.')[2] as string)
        completions[index] = content
      }
    }
  })

  return {
    input: prompts.filter(Boolean),
    output: completions.filter(Boolean),
  }
}

function extractInputContents(
  attrs: Record<string, string | number | boolean>,
  key: string,
  value: string | number | boolean,
): Message | undefined {
  const parts = key.split('.')
  if (!parts[2]) return undefined

  const index = parseInt(parts[2])
  const role = attrs[`gen_ai.prompt.${index}.role`] as string

  let content
  if (role === 'tool') {
    content = extractOpenAIToolResult(attrs, index)
  } else {
    content = extractContent(value)
  }

  return { role, content }
}

function extractOutputContents(
  attrs: Record<string, string | number | boolean>,
  key: string,
  value: string | number | boolean,
): Message | undefined {
  const parts = key.split('.')
  if (!parts[2]) return undefined

  const index = parseInt(parts[2])
  const role = attrs[`gen_ai.completion.${index}.role`] as string
  const finishReason = attrs[
    `gen_ai.completion.${index}.finish_reason`
  ] as string

  let content
  if (finishReason === 'tool_calls') {
    content = extractOpenAIToolCalls(attrs, index)
  } else if (key.endsWith('.content')) {
    content = extractContent(value)
  }

  if (!content) return undefined

  return { role, content }
}

function extractContent(value: string | number | boolean) {
  if (typeof value !== 'string') return value

  const content = tryParseJSON(value)
  if (!content) return value
  if (!Array.isArray(content)) return value

  // NOTE: Most probably a structured output response
  const unknownType = content.some(
    (c) => !c.type || !Object.values(ContentType).includes(c.type),
  )
  if (unknownType) return value

  return content.map((c) => {
    switch (c.type) {
      case 'tool_use':
        return extractAnthropicToolCall(c)
      case 'tool_result':
        return extractAnthropicToolResult(c)
      default:
        return c
    }
  })
}

function extractAnthropicToolResult(content: ToolResultBlockParam) {
  const result = tryParseJSON(content.content as string)
  if (!result) return content

  return {
    type: 'tool-result',
    toolCallId: content.tool_use_id || '-',
    toolName: '-',
    result,
    isError: false,
  }
}

function extractAnthropicToolCall(content: ToolUseBlock) {
  return {
    type: 'tool-call',
    args: content.input || {},
    toolName: content.name || '-',
    toolCallId: content.id || '-',
  }
}

function extractOpenAIToolResult(
  attrs: Record<string, string | number | boolean>,
  index: number,
): ToolResultPart[] {
  const toolName = attrs[`gen_ai.prompt.${index}.tool_name`] as string
  const toolCallId = attrs[`gen_ai.prompt.${index}.tool_call_id`] as string
  const content = tryParseJSON(
    attrs[`gen_ai.prompt.${index}.content`] as string,
  )
  const isError = (attrs[`gen_ai.prompt.${index}.is_error`] as boolean) || false

  return [
    {
      type: 'tool-result',
      toolCallId: toolCallId || '-',
      toolName: toolName || '-',
      result: content,
      isError,
    },
  ]
}

function extractOpenAIToolCalls(
  attrs: Record<string, string | number | boolean>,
  completionIndex: number,
): ToolCallPart[] {
  const toolCalls: ToolCallPart[] = []
  let toolCallIndex = 0

  while (true) {
    const toolCallKey = `gen_ai.completion.${completionIndex}.tool_calls.${toolCallIndex}`
    const toolName = attrs[`${toolCallKey}.name`] as string
    if (!toolName) break

    const args = tryParseJSON(attrs[`${toolCallKey}.arguments`] as string)
    toolCalls.push({
      type: 'tool-call',
      toolCallId:
        (attrs[`${toolCallKey}.id`] as string) ||
        `call_${completionIndex}_${toolCallIndex}`,
      toolName,
      args,
    })

    toolCallIndex++
  }

  return toolCalls
}
