import type { AnnotationAnchor, AnnotationScoreMetadata } from "@domain/scores"

export const buildAnnotationScoreMetadata = (
  feedback: string,
  anchor: AnnotationAnchor | undefined,
): AnnotationScoreMetadata => ({
  rawFeedback: feedback,
  ...(anchor?.messageIndex !== undefined ? { messageIndex: anchor.messageIndex } : {}),
  ...(anchor?.partIndex !== undefined ? { partIndex: anchor.partIndex } : {}),
  ...(anchor?.startOffset !== undefined ? { startOffset: anchor.startOffset } : {}),
  ...(anchor?.endOffset !== undefined ? { endOffset: anchor.endOffset } : {}),
})
