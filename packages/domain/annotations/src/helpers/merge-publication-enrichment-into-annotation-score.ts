import type { AnnotationScore } from "@domain/scores"
import { SessionId, SpanId } from "@domain/shared"

export interface AnnotationPublicationEnrichmentFields {
  readonly enrichedFeedback: string
  readonly resolvedSessionId: string | null
  readonly resolvedSpanId: string | null
}

/** Pure merge used when persisting an enriched draft via {@link writeScoreUseCase} (e.g. Temporal activity). */
export const mergeEnrichmentIntoAnnotationScoreForPublication = (
  annotationScore: AnnotationScore,
  enrichment: AnnotationPublicationEnrichmentFields,
): AnnotationScore => ({
  ...annotationScore,
  issueId: null,
  sessionId: enrichment.resolvedSessionId === null ? null : SessionId(enrichment.resolvedSessionId),
  spanId: enrichment.resolvedSpanId === null ? null : SpanId(enrichment.resolvedSpanId),
  feedback: enrichment.enrichedFeedback,
  draftedAt: null,
  updatedAt: new Date(),
})
