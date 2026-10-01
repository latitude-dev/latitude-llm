import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { type TaxonomyMomentObservation, TaxonomyObservationRepository } from "@domain/taxonomy"
import { Effect } from "effect"
import type { SessionAnalysis } from "../entities/session-analysis.ts"
import type { SessionMomentLabel } from "../entities/session-moment-label.ts"
import type { SessionSemanticMoment } from "../entities/session-semantic-moment.ts"
import { SessionAnalysisRepository } from "../ports/session-analysis-repository.ts"
import { SessionMomentLabelRepository } from "../ports/session-moment-label-repository.ts"
import { SessionSemanticMomentRepository } from "../ports/session-semantic-moment-repository.ts"

export interface ListSessionMomentIntelligenceInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly analysisHash?: string
}

export interface SessionMomentIntelligenceRow {
  readonly moment: SessionSemanticMoment
  readonly labels: readonly SessionMomentLabel[]
  readonly taxonomyObservations: readonly TaxonomyMomentObservation[]
}

export interface ListSessionMomentIntelligenceResult {
  readonly moments: readonly SessionMomentIntelligenceRow[]
}

type AnalysisScope = { readonly skip: true } | { readonly skip: false; readonly analysisHash: string | undefined }

const pinnedAnalysisHash = (latestAnalysis: SessionAnalysis | null): string | undefined =>
  latestAnalysis?.analysisStatus === "analyzed" ? latestAnalysis.analysisHash : undefined

const resolveAnalysisScope = (input: ListSessionMomentIntelligenceInput) =>
  Effect.gen(function* () {
    if (input.analysisHash) return { skip: false, analysisHash: input.analysisHash } satisfies AnalysisScope

    const analyses = yield* SessionAnalysisRepository
    const latestAnalysis = yield* analyses.findLatest({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      sessionId: SessionId(input.sessionId),
    })
    // Moments/labels are keyed by analysis_hash and superseded generations
    // are never deleted, so an unscoped read returns the union of every
    // re-analysis. Default to the session's current analysis — and when the
    // current analysis is failed/skipped there is NO valid generation: prior
    // generations are stale by definition (the content changed), so the
    // session shows no moments rather than a union of every old run.
    if (latestAnalysis !== null && latestAnalysis.analysisStatus !== "analyzed") {
      return { skip: true } satisfies AnalysisScope
    }
    return { skip: false, analysisHash: pinnedAnalysisHash(latestAnalysis) } satisfies AnalysisScope
  })

const appendByMomentId = <T>(grouped: Map<string, T[]>, momentId: string, item: T) => {
  grouped.set(momentId, [...(grouped.get(momentId) ?? []), item])
}

const groupLabelsByMomentId = (
  sessionLabels: readonly SessionMomentLabel[],
  analysisHash: string | undefined,
): Map<string, SessionMomentLabel[]> => {
  const labelsByMoment = new Map<string, SessionMomentLabel[]>()
  for (const label of sessionLabels) {
    if (analysisHash && label.analysisHash !== analysisHash) continue
    appendByMomentId(labelsByMoment, label.momentId, label)
  }
  return labelsByMoment
}

const groupObservationsByMomentId = (
  observations: readonly TaxonomyMomentObservation[],
): Map<string, TaxonomyMomentObservation[]> => {
  const observationsByMoment = new Map<string, TaxonomyMomentObservation[]>()
  for (const observation of observations) {
    appendByMomentId(observationsByMoment, observation.momentId, observation)
  }
  return observationsByMoment
}

export const listSessionMomentIntelligenceUseCase = (input: ListSessionMomentIntelligenceInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("conversationIntelligence.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("conversationIntelligence.sessionId", input.sessionId)

    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)
    const sessionId = SessionId(input.sessionId)
    const semanticMoments = yield* SessionSemanticMomentRepository
    const labels = yield* SessionMomentLabelRepository
    const taxonomyObservations = yield* TaxonomyObservationRepository

    const scope = yield* resolveAnalysisScope(input)
    if (scope.skip) return { moments: [] } satisfies ListSessionMomentIntelligenceResult
    const { analysisHash } = scope

    const [moments, sessionLabels, observations] = yield* Effect.all([
      semanticMoments.listBySession({ organizationId, projectId, sessionId }),
      labels.listBySession({ organizationId, projectId, sessionId }),
      taxonomyObservations.listBySession({
        organizationId,
        projectId,
        sessionId,
        ...(analysisHash ? { analysisHash } : {}),
      }),
    ])

    const filteredMoments = analysisHash ? moments.filter((moment) => moment.analysisHash === analysisHash) : moments
    const labelsByMoment = groupLabelsByMomentId(sessionLabels, analysisHash)
    const observationsByMoment = groupObservationsByMomentId(observations)

    return {
      moments: filteredMoments.map((moment) => ({
        moment,
        labels: labelsByMoment.get(moment.momentId) ?? [],
        taxonomyObservations: observationsByMoment.get(moment.momentId) ?? [],
      })),
    } satisfies ListSessionMomentIntelligenceResult
  }).pipe(Effect.withSpan("conversationIntelligence.listSessionMomentIntelligence"))
