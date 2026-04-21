import { isValidId } from "@domain/shared"

export const ANNOTATION_PROVENANCE = ["human", "agent", "api"] as const
export type AnnotationProvenance = (typeof ANNOTATION_PROVENANCE)[number]

interface AnnotationProvenanceInput {
  readonly sourceId: string
  readonly annotatorId: string | null
}

export function getAnnotationProvenance(annotation: AnnotationProvenanceInput): AnnotationProvenance | null {
  const { sourceId, annotatorId } = annotation

  if (annotatorId !== null) return "human"

  if (sourceId === "API") return "api"

  if (sourceId === "SYSTEM" || isValidId(sourceId)) return "agent"

  return null
}
