import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { type TaxonomyMomentObservation, TaxonomyObservationRepository } from "@domain/taxonomy"
import { Effect } from "effect"
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
    const analyses = yield* SessionAnalysisRepository

    // Moments/labels are keyed by analysis_hash and superseded generations
    // are never deleted, so an unscoped read returns the union of every
    // re-analysis. Default to the session's current analysis — and when the
    // current analysis is failed/skipped there is NO valid generation: prior
    // generations are stale by definition (the content changed), so the
    // session shows no moments rather than a union of every old run.
    const latestAnalysis = input.analysisHash
      ? null
      : yield* analyses.findLatest({ organizationId, projectId, sessionId })
    if (!input.analysisHash && latestAnalysis !== null && latestAnalysis.analysisStatus !== "analyzed") {
      return { moments: [] } satisfies ListSessionMomentIntelligenceResult
    }
    const analysisHash =
      input.analysisHash ?? (latestAnalysis?.analysisStatus === "analyzed" ? latestAnalysis.analysisHash : undefined)

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
    const labelsByMoment = new Map<string, SessionMomentLabel[]>()
    for (const label of sessionLabels) {
      if (analysisHash && label.analysisHash !== analysisHash) continue
      labelsByMoment.set(label.momentId, [...(labelsByMoment.get(label.momentId) ?? []), label])
    }
    const observationsByMoment = new Map<string, TaxonomyMomentObservation[]>()
    for (const observation of observations) {
      observationsByMoment.set(observation.momentId, [
        ...(observationsByMoment.get(observation.momentId) ?? []),
        observation,
      ])
    }

    return {
      moments: filteredMoments.map((moment) => ({
        moment,
        labels: labelsByMoment.get(moment.momentId) ?? [],
        taxonomyObservations: observationsByMoment.get(moment.momentId) ?? [],
      })),
    } satisfies ListSessionMomentIntelligenceResult
  }).pipe(Effect.withSpan("conversationIntelligence.listSessionMomentIntelligence"))
