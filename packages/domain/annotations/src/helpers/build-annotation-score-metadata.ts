import type { AnnotationAnchor, AnnotationScoreMetadata } from "@domain/scores"

export const buildAnnotationScoreMetadata = (
  feedback: string,
  anchor: AnnotationAnchor | undefined,
): AnnotationScoreMetadata => ({
  rawFeedback: feedback,
  ...anchor,
})
