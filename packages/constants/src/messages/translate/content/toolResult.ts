import { ToolContent } from '../../../legacyCompiler'
import { caseVariations, extractValue, stringify } from '../utils'

/**
 * Given a content part, it will check if it is explicitly defined as a tool result part,
 * and return its ToolResultContent. Returns undefined if the part is not identified as a tool result part.
 */
export function findAndExtractToolResultContent(
  part: Record<string, unknown>,
): ToolContent | undefined {
  const { type } = part as { type?: string }

  const validTypes = [
    ...caseVariations('tool result'),
    ...caseVariations('tool response'),
    ...caseVariations('tool call response'),
    ...caseVariations('tool use response'),
    ...caseVariations('tool invocation response'),
    ...caseVariations('tool call response'),
    ...caseVariations('tool use response'),
    ...caseVariations('tool invocation response'),
  ]

  if (!type) {
    // No explicit type definition, default to nothing
    return undefined
  }

  if (!validTypes.includes(type)) {
    // Explicitly not a tool call, return undefined
    return undefined
  }

  // Explicitly type=tool_result

  const toolCallId = extractValue(
    ['id', ...caseVariations('tool call id')],
    part,
  )
  const toolName = extractValue(['name', ...caseVariations('tool name')], part)
  const result = extractValue(
    ['result', ...caseVariations('tool result')],
    part,
  )

  const error = extractValue(['error', ...caseVariations('tool error')], part)

  const isError =
    (error !== undefined && error !== false) ||
    ((extractValue(caseVariations('is error'), part) as boolean) ?? false)

  return {
    type: 'tool-result',
    toolName: stringify(toolName),
    toolCallId: stringify(toolCallId),
    result: stringify(result),
    isError,
  }
}
