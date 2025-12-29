import { ToolRequestContent } from '../../../legacyCompiler'
import { caseVariations, extractValue, stringify } from '../utils'

export function extractToolCallContent(
  toolCall: unknown,
): ToolRequestContent | undefined {
  if (typeof toolCall !== 'object' || toolCall === null) {
    return undefined
  }

  const part = toolCall as Record<string, unknown>

  // Handle OpenAI Chat Completions nested function object
  const functionObj = part.function as Record<string, unknown> | undefined

  const name = extractValue(
    [
      'name',
      ...caseVariations('function name'),
      ...caseVariations('tool name'),
    ],
    functionObj ?? part,
  )

  const id = extractValue(
    ['id', ...caseVariations('tool call id'), ...caseVariations('call id')],
    part,
  )

  const rawArgs = extractValue(
    [
      'arguments',
      'args',
      ...caseVariations('tool arguments'),
      'params',
      'parameters',
      'input',
    ],
    functionObj ?? part,
  )

  if (!id) {
    return undefined
  }

  // Parse arguments if they are a JSON string (OpenAI Chat Completions format)
  let args: Record<string, unknown>
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>
    } catch {
      args = { raw: rawArgs }
    }
  } else {
    args = (rawArgs as Record<string, unknown>) ?? {}
  }

  return {
    type: 'tool-call',
    toolCallId: stringify(id),
    toolName: stringify(name),
    args,
  }
}

/**
 * Given a content part, it will check if it is explicitly defined as a tool call part,
 * and return its ToolRequestContent. Returns undefined if the part is not identified as a tool call part.
 */
export function findAndExtractToolCallContent(
  part: Record<string, unknown>,
): ToolRequestContent | undefined {
  const { type } = part as { type?: string }

  const validTypes = [
    'function', // OpenAI Chat Completions tool_calls array items
    ...caseVariations('tool call'),
    ...caseVariations('tool use'),
    ...caseVariations('function call'),
    ...caseVariations('tool invocation'),
  ]

  if (!type) {
    return undefined
  }

  if (!validTypes.includes(type)) {
    return undefined
  }

  return extractToolCallContent(part)
}
