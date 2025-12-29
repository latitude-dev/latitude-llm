import { isEncodedImage } from '../../../helpers'
import { ImageContent } from '../../../legacyCompiler'
import { caseVariations, extractValue } from '../utils'

/**
 * Given a content part, it will check if it is explicitly defined as a image part,
 * and return its ImageContent. Returns undefined if the part is not identified as a image part.
 */
export function findAndExtractImageContent(
  part: Record<string, unknown>,
): ImageContent | undefined {
  const { type } = part as { type?: string }

  if (!type) {
    // No explicit type definition, default to nothing
    return undefined
  }

  const validTypes = [
    'image',
    ...caseVariations('image url'),
    ...caseVariations('input image'),
    ...caseVariations('image part'),
  ]
  if (!validTypes.includes(type)) {
    // Explicitly not an image, return undefined
    return undefined
  }

  // Explicitly type=image

  const imageValue = extractValue(
    [
      'image',
      ...caseVariations('image url'),
      'source',
      'uri',
      'url',
      'src',
      'source',
      ...caseVariations('source data'),
      'data',
    ],
    part,
  )

  if (!imageValue) {
    // It is type image but no image value has been found
    return {
      type: 'image',
      image: '',
    }
  }

  // Image value is a valid image file
  if (
    imageValue instanceof Uint8Array ||
    imageValue instanceof ArrayBuffer ||
    imageValue instanceof URL ||
    isEncodedImage(imageValue)
  ) {
    return {
      type: 'image',
      image: imageValue,
    } as ImageContent
  }

  // Image value actually contains more data inside
  if (typeof imageValue === 'object' && imageValue !== null) {
    const { mimeType } = imageValue as { mimeType?: string }
    const imageData = extractValue(['data', 'source'], imageValue)
    if (imageData) {
      return {
        type: 'image',
        image: imageData,
      } as ImageContent
    }

    return {
      type: 'image',
      image: imageValue,
      mimeType: mimeType,
    } as ImageContent
  }

  // Fallback to empty image
  return {
    type: 'image',
    image: '',
  }
}
