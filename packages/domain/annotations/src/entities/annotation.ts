import {
  type AnnotationAnchor,
  type AnnotationScore,
  type AnnotationScoreMetadata,
  type AnnotationScoreSourceId,
  annotationAnchorSchema,
  annotationScoreMetadataSchema,
  annotationScoreSchema,
  annotationScoreSourceIdSchema,
} from "@domain/scores"

// Annotations remain canonical annotation-backed scores rather than a separate fact table.
export const annotationSchema = annotationScoreSchema
export type Annotation = AnnotationScore

export const annotationMetadataSchema = annotationScoreMetadataSchema
export type AnnotationMetadata = AnnotationScoreMetadata

export const annotationSourceIdSchema = annotationScoreSourceIdSchema
export type AnnotationSourceId = AnnotationScoreSourceId

export { annotationAnchorSchema }
export type { AnnotationAnchor }
