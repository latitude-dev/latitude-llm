import { TextContent } from '../../../legacyCompiler'
import { caseVariations, extractValue, stringify } from '../utils'

const TEXT_TYPES = [
  'text',
  ...caseVariations('input text'),
  ...caseVariations('output text'),
]

/**
 * Given a content part, it will check if it is explicitly defined as a text part,
 * and return its TextContent. Returns undefined if the part is not identified as a text part.
 */
export function findAndExtractTextContent(
  part: Record<string, unknown>,
): TextContent | undefined {
  if (typeof part === 'string') {
    return { type: 'text', text: part }
  }

  if ('type' in part && !TEXT_TYPES.includes(part.type as string)) {
    return undefined
  }

  const textValue = extractValue(['text', 'value', 'content'], part)
  if (textValue === undefined) return undefined

  return {
    type: 'text',
    text: stringify(textValue),
  }
}
