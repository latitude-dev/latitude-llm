import {
  ReasoningContent,
  RedactedReasoningContent,
} from '../../../legacyCompiler'
import {
  caseVariations,
  extractValue,
  omitUndefined,
  stringify,
} from '../utils'

/**
 * Given a content part, it will check if it is explicitly defined as a reasoning part,
 * and return its ReasoningContent or RedactedReasoningContent. Returns undefined if the part is not identified as a reasoning part.
 */
export function findAndExtractReasoningContent(
  part: Record<string, unknown>,
): ReasoningContent | RedactedReasoningContent | undefined {
  const { type } = part as { type?: string }

  if (!type) {
    // No explicit type definition, default to nothing
    return undefined
  }

  const validTypes = [
    'reasoning',
    'thinking',
    'thought',
    'analysis',
    ...caseVariations('redacted reasoning'),
  ]

  if (!validTypes.includes(type) && !('thought_signature' in part)) {
    // Explicitly not a reasoning part, return undefined
    return undefined
  }

  // Explicitly type=reasoning

  const text = stringify(
    extractValue(
      [
        'reasoning',
        'thinking',
        'thought',
        'analysis',
        'text',
        'value',
        'content',
        'data',
      ],
      part,
    ),
  )

  const id = extractValue(['id', ...caseVariations('thought signature')], part)

  const isHidden =
    !!extractValue(['hidden'], part) || type === 'redacted-reasoning'

  if (isHidden) {
    return {
      type: 'redacted-reasoning',
      data: text,
    }
  }

  return {
    type: 'reasoning',
    ...(omitUndefined({ id }) as { id: string }),
    text,
  }
}
