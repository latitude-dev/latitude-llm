import { SAFETY_SUITE_SLUGS } from "@domain/flaggers"
import { isConfirmedHarmFindingKind, type SafetyFindingKind, ScoreRepository } from "@domain/scores"
import { type OrganizationId, type ProjectId, SessionId } from "@domain/shared"
import { Effect } from "effect"
import type { SafetyCoverageFloors } from "../entities/agent-score-artifact.ts"
import { SafetyWindowDecisionSource } from "../ports/safety-window-source.ts"
import {
  estimateProjectSafety,
  type SafetyMemberDecision,
  type SafetySessionExamination,
} from "../scoring/estimate-safety.ts"

/** How many sessions one harm read covers. Bounded so a 28-day window is many small queries, not one unbounded `IN`. */
export const SAFETY_FINDING_BATCH_SIZE = 500

export interface EstimateProjectSafetyWindowInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
  readonly supportedJudgmentVersions: readonly string[]
  readonly floors: SafetyCoverageFloors
  readonly referenceRunSessions: number
  readonly confidenceLevel?: number
  readonly batchSize?: number
}

interface SafetyScoreMetadata {
  readonly flaggerSlug?: string
  readonly safetyFindingKind?: SafetyFindingKind
  readonly scoringArtifactVersion?: string
}

const batched = <Value>(values: readonly Value[], size: number): Value[][] => {
  const batches: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size))
  }
  return batches
}

/**
 * The project's Safety over a window, composed from the screening decisions that
 * record which sessions the suite examined and the scores that record what it
 * found.
 *
 * Reads only; it writes no snapshot and publishes nothing, in the same position
 * `estimateProjectOutcomeWindow` holds for Outcome.
 */
export const estimateProjectSafetyWindow = Effect.fn("agentScore.estimateProjectSafetyWindow")(function* (
  input: EstimateProjectSafetyWindowInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const decisionSource = yield* SafetyWindowDecisionSource
  const window = yield* decisionSource.read({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from: input.from,
    to: input.to,
    suiteSlugs: SAFETY_SUITE_SLUGS,
  })

  const decisionsBySession = new Map<string, SafetyMemberDecision[]>()
  for (const decision of window.decisions) {
    const sessionDecisions = decisionsBySession.get(decision.sessionId) ?? []
    sessionDecisions.push(decision)
    decisionsBySession.set(decision.sessionId, sessionDecisions)
  }

  const sessionIds = [...decisionsBySession.keys()]
  const scoreRepository = yield* ScoreRepository
  const scoreBatches = yield* Effect.forEach(
    batched(sessionIds, input.batchSize ?? SAFETY_FINDING_BATCH_SIZE),
    (batch) =>
      scoreRepository.listBySessionsAndTraces({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sessionIds: batch.map(SessionId),
        traceIds: [],
        createdAtTo: input.to,
      }),
    { concurrency: 1 },
  )

  // Harm unions per session: several detectors on one session are one harmed
  // session, and the judge behind each finding decides whether it can be pooled.
  const harmVersionsBySession = new Map<string, string[]>()
  for (const score of scoreBatches.flat()) {
    const metadata = score.metadata as SafetyScoreMetadata | null
    const findingKind = metadata?.safetyFindingKind
    if (!findingKind || !isConfirmedHarmFindingKind(findingKind)) continue
    if (score.sessionId === null || !decisionsBySession.has(score.sessionId)) continue
    const versions = harmVersionsBySession.get(score.sessionId) ?? []
    versions.push(metadata?.scoringArtifactVersion ?? "")
    harmVersionsBySession.set(score.sessionId, versions)
  }

  const sessions = sessionIds.map(
    (sessionId): SafetySessionExamination => ({
      sessionId,
      decisions: decisionsBySession.get(sessionId) ?? [],
      harmJudgmentVersions: harmVersionsBySession.get(sessionId) ?? [],
    }),
  )

  return estimateProjectSafety({
    eligibleSessionCount: window.eligibleSessionCount,
    sessions,
    suiteSlugs: SAFETY_SUITE_SLUGS,
    supportedJudgmentVersions: input.supportedJudgmentVersions,
    floors: input.floors,
    referenceRunSessions: input.referenceRunSessions,
    ...(input.confidenceLevel !== undefined ? { confidenceLevel: input.confidenceLevel } : {}),
  })
})
