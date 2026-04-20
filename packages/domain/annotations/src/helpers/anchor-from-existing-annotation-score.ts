import { type AnnotationAnchor, type AnnotationScore, annotationAnchorSchema } from "@domain/scores"

/**
 * Rebuilds the annotation anchor from a persisted annotation score's metadata.
 * Used on draft updates so positioning is not taken from the HTTP payload.
 */
export function anchorFromExistingAnnotationScore(score: AnnotationScore): AnnotationAnchor | undefined {
  const m = score.metadata
  if (m.messageIndex === undefined) return undefined
  const candidate: AnnotationAnchor = { messageIndex: m.messageIndex }
  if (m.partIndex !== undefined) {
    candidate.partIndex = m.partIndex
  }
  if (m.startOffset !== undefined && m.endOffset !== undefined) {
    candidate.startOffset = m.startOffset
    candidate.endOffset = m.endOffset
  }
  const parsedAnchor = annotationAnchorSchema.safeParse(candidate)
  return parsedAnchor.success ? parsedAnchor.data : undefined
}
