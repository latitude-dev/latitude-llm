import { FileContent } from '../../../legacyCompiler'
import { caseVariations, extractValue, stringify } from '../utils'

/**
 * Given a content part, it will check if it is explicitly defined as a file part,
 * and return its FileContent. Returns undefined if the part is not identified as a file part.
 */
export function findAndExtractFileContent(
  part: Record<string, unknown>,
): FileContent | undefined {
  const { type } = part as { type?: string }

  if (!type) {
    // No explicit type definition, default to nothing
    return undefined
  }

  const validTypes = [
    'file',
    ...caseVariations('file url'),
    ...caseVariations('file part'),
    'blob',
    'document',
    'audio',
    'sound',
    'media',
    'video',
    'pdf',
  ]

  if (!validTypes.includes(type)) {
    // Explicitly not a file, return undefined
    return undefined
  }

  // Explicitly type=file

  const fileValue = extractValue(
    [
      'file',
      ...caseVariations('file url'),
      'source',
      'uri',
      'url',
      'src',
      'source',
      ...caseVariations('source data'),
      'data',
      'content',
      'blob',
      'document',
      'audio',
      'sound',
      'media',
      'video',
      'pdf',
      'value',
      ...caseVariations('file part'),
      ...caseVariations('blob part'),
      ...caseVariations('document part'),
      ...caseVariations('content part'),
    ],
    part,
  )

  const mimeType = () => {
    const directValue = extractValue(caseVariations('mime type'), part)
    if (directValue) return stringify(directValue)

    if (type === 'pdf' || 'pdf' in part) return 'application/pdf'
    if (type === 'audio' || 'audio' in part) return 'audio/mpeg'
    if (type === 'video' || 'video' in part) return 'video/mp4'
    if (type === 'document' || 'document' in part) return 'application/pdf'
    if (type === 'audio' || 'audio' in part) return 'audio/mpeg'
    if (type === 'video' || 'video' in part) return 'video/mp4'
    if (type === 'document' || 'document' in part) return 'application/pdf'

    return undefined
  }

  return {
    type: 'file',
    mimeType: stringify(mimeType()),
    file: fileValue,
  } as FileContent
}
