import type { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentScoreResult } from "../entities/agent-score.ts"
import type { AgentScoreArtifact, ScoringJudge } from "../entities/agent-score-artifact.ts"
import { resolveScoringVersion } from "../entities/agent-score-artifact.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { LatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { ScoreWindowSource } from "../ports/score-window-source.ts"
import { readSessionAssessmentInputBatch } from "../readers/read-session-assessment-batch.ts"
import { EMPTY_COST_FAMILY_DENOMINATORS } from "../scoring/aggregate-session-cost.ts"
import { aggregateWindowSpeed } from "../scoring/bootstrap-window.ts"
import { composeAgentScore } from "../scoring/compose-agent-score.ts"
import { estimateProjectReliability } from "../scoring/estimate-reliability.ts"
import { EMPTY_WINDOW_FOLD, foldWindowBatch, type WindowFold } from "../scoring/fold-window-contributions.ts"
import { selectDeterministicOutcomeFailures } from "../scoring/select-outcome-endpoints.ts"
import { type ReliabilitySessionEndpoint, selectReliabilityEndpoints } from "../scoring/select-reliability-endpoints.ts"
import { selectScoreWindow } from "../scoring/select-score-window.ts"
import { tallyWindowReaderCoverage, type WindowReaderCoverage } from "../scoring/tally-reader-coverage.ts"
import { gateCostWindow, gateSpeedWindow } from "../scoring/window-gates.ts"
import { estimateProjectOutcomeWindow } from "./estimate-project-outcome.ts"
import { estimateProjectSafetyWindow } from "./estimate-project-safety.ts"

/**
 * How many sessions one pass reads.
 *
 * The batch is the unit of residency: it is read, folded to a handful of numbers per session, and
 * released before the next one starts, so a thousand-session window never has a thousand sessions
 * of prompts and tool payloads in memory at once.
 */
export const AGENT_SCORE_BATCH_SIZE = 50

export interface ComputeAgentScoreInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The snapshot cutoff. Every candidate step ends here. */
  readonly to: Date
  readonly artifact: AgentScoreArtifact
  readonly costArtifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
  readonly latencyArtifact: LatencyReferenceArtifact
  readonly judge: ScoringJudge
  /** Yesterday's stored step, which is what makes the window choice sticky. */
  readonly previousStepDays?: number
  readonly batchSize?: number
  readonly replicates?: number
  readonly seed?: number
}

const batched = <Value>(values: readonly Value[], size: number): Value[][] => {
  const batches: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size))
  }
  return batches
}

const denominatorsOf = (session: NormalizedSessionAssessmentInput) =>
  session.costEvidence?.denominators ?? EMPTY_COST_FAMILY_DENOMINATORS

interface WindowPass {
  readonly fold: WindowFold
  readonly reliabilityEndpoints: readonly ReliabilitySessionEndpoint[]
  readonly deterministicOutcomeFailures: readonly string[]
  readonly readers: ReadonlyMap<string, WindowReaderCoverage>
  readonly readSessionCount: number
}

/**
 * One bounded pass over the window, folding every dimension's evidence as each batch lands.
 *
 * Deliberately one read rather than one per dimension. The five estimators want different things
 * from the same sessions, and reading the window five times would be five chances for them to
 * disagree about which sessions they were describing, on top of five times the cost.
 */
const readWindow = Effect.fn("agentScore.readWindow")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionIds: readonly SessionId[]
  readonly cutoff: Date
  readonly latencyArtifact: LatencyReferenceArtifact
  readonly costArtifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
  readonly batchSize: number
}) {
  let fold: WindowFold = EMPTY_WINDOW_FOLD
  const reliabilityEndpoints: ReliabilitySessionEndpoint[] = []
  const deterministicOutcomeFailures: string[] = []
  let readers: ReadonlyMap<string, WindowReaderCoverage> = new Map()
  let readSessionCount = 0

  for (const sessionIds of batched(input.sessionIds, input.batchSize)) {
    const sessions = yield* readSessionAssessmentInputBatch({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionIds,
      cutoff: input.cutoff,
      latencyArtifact: input.latencyArtifact,
    })
    readSessionCount += sessions.length
    fold = foldWindowBatch({
      fold,
      sessions,
      denominatorsFor: denominatorsOf,
      artifact: input.costArtifact,
      catalog: input.catalog,
    })
    reliabilityEndpoints.push(...selectReliabilityEndpoints(sessions))
    deterministicOutcomeFailures.push(...selectDeterministicOutcomeFailures(sessions))
    readers = tallyWindowReaderCoverage(sessions, readers)
  }

  return {
    fold,
    reliabilityEndpoints,
    deterministicOutcomeFailures,
    readers,
    readSessionCount,
  } satisfies WindowPass
})

/**
 * The project's Agent Score for one cutoff.
 *
 * Selects the window, reads it once, runs the five estimators over the same population, and
 * publishes only when all five pass. Nothing here decides what a metric means or how a family is
 * weighted: those live in the catalog, the evaluators and the frozen artifacts, and this composes
 * their answers. It writes nothing, so a caller can run it against any cutoff without side effects.
 */
export const computeAgentScore = Effect.fn("agentScore.computeAgentScore")(function* (input: ComputeAgentScoreInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const version = resolveScoringVersion({ artifact: input.artifact, judge: input.judge })
  const windowSource = yield* ScoreWindowSource
  const counts = yield* windowSource.readEligibleCounts({
    organizationId: input.organizationId,
    projectId: input.projectId,
    to: input.to,
    stepDays: input.artifact.window.stepDays,
  })
  const selection = selectScoreWindow({
    counts,
    settings: input.artifact.window,
    ...(input.previousStepDays !== undefined ? { previousStepDays: input.previousStepDays } : {}),
  })

  if (selection.status === "withheld") {
    yield* Effect.annotateCurrentSpan("agentScore.withheld", "sessionFloor")
    const belowFloor: AgentScoreResult = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoringVersion: version.scoringVersion,
      status: "withheld",
      dimensions: [],
      withheldReason: "sessionFloor",
    }
    return belowFloor
  }

  const from = new Date(input.to.getTime() - selection.stepDays * 24 * 60 * 60 * 1000)
  const sessionIds = yield* windowSource.readEligibleSessionIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from,
    to: input.to,
  })

  const pass = yield* readWindow({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionIds,
    cutoff: input.to,
    latencyArtifact: input.latencyArtifact,
    costArtifact: input.costArtifact,
    catalog: input.catalog,
    batchSize: input.batchSize ?? AGENT_SCORE_BATCH_SIZE,
  })

  const outcome = yield* estimateProjectOutcomeWindow({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from,
    to: input.to,
    supportedJudgmentVersions: version.supportedJudgmentVersions.taskOutcome,
    deterministicFailureSessionIds: pass.deterministicOutcomeFailures,
    floors: input.artifact.dimensionFloors.outcome,
  })
  const safety = yield* estimateProjectSafetyWindow({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from,
    to: input.to,
    supportedJudgmentVersions: version.supportedJudgmentVersions.safety,
    floors: input.artifact.dimensionFloors.safety,
    referenceRunSessions: input.artifact.referenceRuns.safety,
  })
  const reliability = estimateProjectReliability({
    eligibleSessionCount: selection.eligibleSessionCount,
    sessions: pass.reliabilityEndpoints,
    floors: input.artifact.dimensionFloors.reliability,
    referenceRunSessions: input.artifact.referenceRuns.reliability,
  })

  const cost = {
    gate: gateCostWindow({
      fold: pass.fold,
      artifact: input.costArtifact,
      floors: input.artifact.dimensionFloors.cost,
    }),
  }
  const speed = {
    gate: gateSpeedWindow({
      speed: aggregateWindowSpeed(pass.fold.contributions),
      eligibleSessionCount: selection.eligibleSessionCount,
      floors: input.artifact.dimensionFloors.speed,
    }),
  }

  const composition = composeAgentScore({
    artifact: input.artifact,
    costArtifact: input.costArtifact,
    outcome,
    reliability,
    safety,
    cost,
    speed,
    contributions: pass.fold.contributions,
    ...(input.replicates !== undefined ? { replicates: input.replicates } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  })

  yield* Effect.annotateCurrentSpan("agentScore.stepDays", selection.stepDays)
  yield* Effect.annotateCurrentSpan("agentScore.unmeasured", composition.unmeasuredDimensions.join(",") || "none")

  const result: AgentScoreResult = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoringVersion: version.scoringVersion,
    status: composition.composite ? "published" : "withheld",
    window: {
      stepDays: selection.stepDays,
      from,
      to: input.to,
      reason: selection.reason,
      eligibleSessionCount: selection.eligibleSessionCount,
    },
    dimensions: composition.dimensions,
    ...(composition.composite ? { composite: composition.composite } : {}),
    ...(composition.composite ? {} : { withheldReason: "unmeasuredDimensions" as const }),
    coverage: {
      eligibleSessionCount: selection.eligibleSessionCount,
      readSessionCount: pass.readSessionCount,
      outcome,
      reliability,
      safety,
      cost: cost.gate,
      speed: speed.gate,
      readers: [...pass.readers.values()],
      artifactVersions: {
        cost: input.costArtifact.artifactVersion,
        costCatalog: input.catalog.catalogVersion,
        latency: input.latencyArtifact.artifactVersion,
      },
      unmeasuredSignalEffects: 0,
    },
    native: { cost: composition.cost, speed: composition.speed },
  }
  return result
})
