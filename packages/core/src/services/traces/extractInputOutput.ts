import { ToolCallPart, ToolResultPart } from './types'
import { tryParseJSON } from './utils'

type Message = {
  role: string
  content: unknown
}

function extractPromptMessage(
  attrs: Record<string, string | number | boolean>,
  key: string,
  value: string | number | boolean,
): Message | undefined {
  const parts = key.split('.')
  if (!parts[2]) return undefined

  const index = parseInt(parts[2])
  const role = attrs[`gen_ai.prompt.${index}.role`] as string
  let content = tryParseJSON(value as string)
  if (content === null) return undefined

  if (role === 'tool') {
    content = extractToolResult(attrs, index)
  }

  return { role, content }
}

function extractToolResult(
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
      toolCallId: toolCallId || 'unknown',
      toolName: toolName || 'unknown',
      result: content,
      isError,
    },
  ]
}

function extractCompletionMessage(
  attrs: Record<string, string | number | boolean>,
  key: string,
  value: string | number | boolean,
): Message | undefined {
  const parts = key.split('.')
  if (!parts[2]) return undefined

  const index = parseInt(parts[2])
  const role = attrs[`gen_ai.completion.${index}.role`] as string
  const finishReason = attrs[`gen_ai.completion.${index}.finish_reason`]

  if (finishReason === 'tool_calls') {
    const toolCalls = extractToolCalls(attrs, index)
    if (toolCalls.length > 0) {
      return { role, content: toolCalls }
    }
    return undefined
  }

  if (key.endsWith('.content')) {
    let content
    try {
      content = tryParseJSON(value as string)
      if (content === null) return undefined
    } catch (e) {
      content = String(value)
    }

    return { role, content }
  }

  return undefined
}

function extractToolCalls(
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

export function extractInputOutput(
  attrs: Record<string, string | number | boolean>,
) {
  const prompts: Array<Message> = []
  const completions: Array<Message> = []

  Object.entries(attrs).forEach(([key, value]) => {
    if (key.startsWith('gen_ai.prompt.') && key.endsWith('.content')) {
      const message = extractPromptMessage(attrs, key, value)
      if (message) {
        const index = parseInt(key.split('.')[2] as string)
        prompts[index] = message
      }
    }

    if (key.startsWith('gen_ai.completion.')) {
      const message = extractCompletionMessage(attrs, key, value)
      if (message) {
        const index = parseInt(key.split('.')[2] as string)
        completions[index] = message
      }
    }
  })

  return {
    input: prompts.filter(Boolean),
    output: completions.filter(Boolean),
  }
}
