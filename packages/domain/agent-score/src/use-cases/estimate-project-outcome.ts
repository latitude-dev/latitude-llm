import { type Score, ScoreRepository } from "@domain/scores"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { OutcomeCoverageFloors } from "../entities/agent-score-artifact.ts"
import { type OutcomeWindowDecision, OutcomeWindowDecisionSource } from "../ports/outcome-window-source.ts"
import { estimateProjectOutcome, type OutcomeSessionVerdict } from "../scoring/estimate-outcome.ts"

/** How many sessions one verdict read covers. Bounded so a 28-day window is many small queries, not one unbounded `IN`. */
export const OUTCOME_VERDICT_BATCH_SIZE = 500

export interface EstimateProjectOutcomeWindowInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
  readonly supportedJudgmentVersions: readonly string[]
  /**
   * Sessions a deterministic reader proved could not have succeeded, from
   * `selectDeterministicOutcomeFailures`. The window job reads that telemetry
   * for the other dimensions anyway; this use-case does not read it again.
   */
  readonly deterministicFailureSessionIds?: readonly string[]
  readonly floors: OutcomeCoverageFloors
  readonly confidenceLevel?: number
  readonly batchSize?: number
}

interface VerdictMetadata {
  readonly flaggerSlug?: string
  readonly analysisHash?: string
  readonly scoringArtifactVersion?: string
}

const TASK_OUTCOME_FLAGGER_SLUG = "task-failure"

/** Map key for one session's verdict in one analysis generation. */
const generationKey = (sessionId: string, analysisHash: string): string => `${sessionId}::${analysisHash}`

const batched = <Value>(values: readonly Value[], size: number): Value[][] => {
  const batches: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size))
  }
  return batches
}

/** A decision that ran the judge to a verdict. Anything else is coverage, not evidence. */
const isJudged = (decision: OutcomeWindowDecision): boolean =>
  decision.selected && (decision.outcome === "success" || decision.outcome === "failure")

const toVerdict = (decision: OutcomeWindowDecision, score: Score | undefined): OutcomeSessionVerdict | null => {
  if (!score) return null
  const metadata = score.metadata as VerdictMetadata | null

  return {
    sessionId: decision.sessionId,
    succeeded: score.passed,
    // Absent probability becomes zero so the estimator excludes it as unknown
    // rather than silently weighting the session as certain.
    inclusionProbability: decision.inclusionProbability ?? 0,
    judgmentVersion: metadata?.scoringArtifactVersion ?? "",
  }
}

/**
 * The project's Outcome over a window, composed from the screening decisions
 * that record who was judged and the scores that record what the judge said.
 *
 * Reads only; it writes no snapshot and publishes nothing, in the same position
 * `runCostSpeedShadow` holds for Cost and Speed.
 */
export const estimateProjectOutcomeWindow = Effect.fn("agentScore.estimateProjectOutcomeWindow")(function* (
  input: EstimateProjectOutcomeWindowInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const decisionSource = yield* OutcomeWindowDecisionSource
  const window = yield* decisionSource.read({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from: input.from,
    to: input.to,
  })

  const judged = window.decisions.filter(isJudged)
  const scoreRepository = yield* ScoreRepository
  const batches = batched(judged, input.batchSize ?? OUTCOME_VERDICT_BATCH_SIZE)

  const scoreBatches = yield* Effect.forEach(
    batches,
    (batch) =>
      scoreRepository.listBySessionsAndTraces({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sessionIds: batch.map((decision) => decision.sessionId),
        traceIds: [],
        createdAtTo: input.to,
      }),
    { concurrency: 1 },
  )

  // The verdict has to belong to the generation the decision describes. A score
  // from an older generation is operational history, not this window's answer.
  const verdictByGeneration = new Map<string, Score>()
  for (const score of scoreBatches.flat()) {
    const metadata = score.metadata as VerdictMetadata | null
    if (metadata?.flaggerSlug !== TASK_OUTCOME_FLAGGER_SLUG || !metadata.analysisHash) continue
    if (score.sessionId === null) continue
    verdictByGeneration.set(generationKey(score.sessionId, metadata.analysisHash), score)
  }

  const judgedSessions = judged.flatMap((decision) => {
    const verdict = toVerdict(
      decision,
      verdictByGeneration.get(generationKey(decision.sessionId, decision.analysisHash)),
    )
    return verdict ? [verdict] : []
  })

  return estimateProjectOutcome({
    eligibleSessionCount: window.eligibleSessionCount,
    deterministicFailureSessionIds: input.deterministicFailureSessionIds ?? [],
    judgedSessions,
    supportedJudgmentVersions: input.supportedJudgmentVersions,
    floors: input.floors,
    ...(input.confidenceLevel !== undefined ? { confidenceLevel: input.confidenceLevel } : {}),
  })
})
