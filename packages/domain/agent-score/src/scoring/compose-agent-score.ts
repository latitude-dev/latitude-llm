import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import type { AgentScoreArtifact } from "../entities/agent-score-artifact.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import { type BinomialInterval, inverseRegularizedIncompleteBeta } from "./binomial-interval.ts"
import {
  aggregateWindowCost,
  aggregateWindowSpeed,
  type SessionWindowContribution,
  type WindowCostAggregate,
  type WindowSpeedAggregate,
} from "./bootstrap-window.ts"
import type { ProjectOutcomeEstimate } from "./estimate-outcome.ts"
import type { ProjectReliabilityEstimate } from "./estimate-reliability.ts"
import type { ProjectSafetyEstimate } from "./estimate-safety.ts"
import { survivalOverReferenceRun } from "./reference-run.ts"
import type { CostWindowGate, SpeedWindowGate } from "./window-gates.ts"

export const DEFAULT_COMPOSITE_REPLICATES = 400

export interface DimensionResult {
  readonly scoreDimension: ScoreDimension
  readonly weight: number
  /** Absent when unmeasured. No midpoint, no zero, no hundred. */
  readonly score?: number
  readonly interval?: BinomialInterval
  readonly coverage: "measured" | "unmeasured"
  /** The floor or condition that blocked publication, named so the page can show what is missing. */
  readonly unmeasuredReason?: string
}

export interface CompositePolicyCapResult {
  readonly applied: boolean
  readonly cap: number
  /** Points removed by the rule, kept apart from the weighted mean so no cause is blamed for them. */
  readonly removedPoints: number
}

export interface AgentScoreComposite {
  readonly score: number
  readonly interval: BinomialInterval
  readonly policyCap?: CompositePolicyCapResult
}

export interface ComposeAgentScoreInput {
  readonly artifact: AgentScoreArtifact
  readonly costArtifact: CostScoringArtifact
  readonly outcome: ProjectOutcomeEstimate
  readonly reliability: ProjectReliabilityEstimate
  readonly safety: ProjectSafetyEstimate
  /**
   * Only the gates. The Cost and Speed numbers are computed here from `contributions`, not supplied,
   * because every replicate recomputes them from the same place: a caller that passed an aggregate
   * built from a different set of sessions would produce an interval that does not contain its own
   * point estimate, and nothing in the types would have said so.
   */
  readonly cost: { readonly gate: CostWindowGate }
  readonly speed: { readonly gate: SpeedWindowGate }
  /** Whole sessions, which is the resampling unit for the Cost and Speed sides of the composite. */
  readonly contributions: readonly SessionWindowContribution[]
  /** Share of Cost the window's unlinked signals add, already inside the artifact's residual cap. */
  readonly residualSignalPenalty?: number
  /** Critical-path nanoseconds the window's unlinked signals add, in Speed's own unit. */
  readonly residualAvoidableNs?: number
  readonly replicates?: number
  readonly seed?: number
  readonly confidenceLevel?: number
}

export interface AgentScoreComposition {
  readonly dimensions: readonly DimensionResult[]
  /** Present only when every dimension passed. One unmeasured dimension publishes nothing at all. */
  readonly composite?: AgentScoreComposite
  readonly unmeasuredDimensions: readonly ScoreDimension[]
  /** The window aggregates this composition scored, so the caller reports what was actually used. */
  readonly cost: WindowCostAggregate
  readonly speed: WindowSpeedAggregate
}

/** Mulberry32, so a replicate set is reproducible from its seed alone. */
const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const percentile = (sorted: readonly number[], fraction: number): number => {
  if (sorted.length === 0) return 0
  const position = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))
  return sorted[position] as number
}

/**
 * One dimension's endpoint as a distribution rather than a single rate.
 *
 * Outcome, Reliability and Safety each reduce to "how often did the adverse thing happen", so a
 * replicate draws that rate from the Beta its counts imply and pushes it back through the same
 * monotone map that produced the point estimate. Resampling the observed vector instead would make
 * a window with zero observed failures produce zero variation, and the composite would claim a
 * precision the evidence does not have.
 */
interface EndpointModel {
  readonly adverseEvents: number
  readonly trials: number
  readonly scoreAt: (adverseRate: number) => number
}

const clampScore = (value: number): number => Math.max(0, Math.min(100, value))

const outcomeModel = (estimate: ProjectOutcomeEstimate): EndpointModel => ({
  adverseEvents: estimate.sampledFailureCount,
  trials: estimate.sampledSessionCount,
  // The census is certain failure at weight one, so only the sampled side moves between replicates.
  scoreAt: (failureRate) => {
    const totalWeight = estimate.sampledWeight + estimate.censusWeight
    return totalWeight <= 0 ? 0 : clampScore((100 * (estimate.sampledWeight * (1 - failureRate))) / totalWeight)
  },
})

const reliabilityModel = (estimate: ProjectReliabilityEstimate, referenceRunSessions: number): EndpointModel => ({
  adverseEvents: estimate.terminalFailureSessionCount,
  trials: estimate.readableSessionCount,
  scoreAt: (failureRate) => survivalOverReferenceRun({ adverseRate: failureRate, referenceRunSessions }),
})

const safetyModel = (estimate: ProjectSafetyEstimate, referenceRunSessions: number): EndpointModel => ({
  adverseEvents: estimate.harmedSessionCount,
  trials: estimate.examinedSessionCount,
  scoreAt: (harmRate) => survivalOverReferenceRun({ adverseRate: harmRate, referenceRunSessions }),
})

/**
 * Draws an adverse rate from the Jeffreys posterior for the observed counts.
 *
 * The half-counts are what keep the draw non-degenerate at the boundaries, which is the whole point:
 * a clean window has seen no harm, not proven that none can happen.
 */
const drawAdverseRate = ({
  model,
  random,
}: {
  readonly model: EndpointModel
  readonly random: () => number
}): number => {
  if (model.trials <= 0) return 0
  const alpha = model.adverseEvents + 0.5
  const beta = model.trials - model.adverseEvents + 0.5
  return inverseRegularizedIncompleteBeta(random(), alpha, beta)
}

const dimensionOf = ({
  scoreDimension,
  artifact,
  coverage,
  score,
  interval,
  unmeasuredReason,
}: {
  readonly scoreDimension: ScoreDimension
  readonly artifact: AgentScoreArtifact
  readonly coverage: "measured" | "unmeasured"
  readonly score?: number
  readonly interval?: BinomialInterval
  readonly unmeasuredReason?: string
}): DimensionResult => ({
  scoreDimension,
  weight: artifact.compositeWeights[scoreDimension],
  coverage,
  ...(coverage === "measured" && score !== undefined ? { score } : {}),
  ...(coverage === "measured" && interval ? { interval } : {}),
  ...(unmeasuredReason ? { unmeasuredReason } : {}),
})

const buildDimensions = (
  input: ComposeAgentScoreInput,
  aggregates: { readonly cost: WindowCostAggregate; readonly speed: WindowSpeedAggregate },
): DimensionResult[] => {
  const { artifact, outcome, reliability, safety, cost, speed } = input
  return [
    dimensionOf({
      scoreDimension: "outcome",
      artifact,
      coverage: outcome.coverage,
      ...(outcome.outcome !== undefined ? { score: outcome.outcome } : {}),
      ...(outcome.interval ? { interval: outcome.interval } : {}),
      ...(outcome.unmeasuredReason ? { unmeasuredReason: outcome.unmeasuredReason } : {}),
    }),
    dimensionOf({
      scoreDimension: "reliability",
      artifact,
      coverage: reliability.coverage,
      ...(reliability.reliability !== undefined ? { score: reliability.reliability } : {}),
      ...(reliability.interval ? { interval: reliability.interval } : {}),
      ...(reliability.unmeasuredReason ? { unmeasuredReason: reliability.unmeasuredReason } : {}),
    }),
    dimensionOf({
      scoreDimension: "cost",
      artifact,
      coverage: cost.gate.coverage,
      score: aggregates.cost.cost,
      ...(cost.gate.unmeasuredReason ? { unmeasuredReason: cost.gate.unmeasuredReason } : {}),
    }),
    dimensionOf({
      scoreDimension: "speed",
      artifact,
      coverage: speed.gate.coverage,
      score: aggregates.speed.speed,
      ...(speed.gate.unmeasuredReason ? { unmeasuredReason: speed.gate.unmeasuredReason } : {}),
    }),
    dimensionOf({
      scoreDimension: "safety",
      artifact,
      coverage: safety.coverage,
      ...(safety.safety !== undefined ? { score: safety.safety } : {}),
      ...(safety.interval ? { interval: safety.interval } : {}),
      ...(safety.unmeasuredReason ? { unmeasuredReason: safety.unmeasuredReason } : {}),
    }),
  ]
}

const weightedComposite = ({
  artifact,
  scores,
}: {
  readonly artifact: AgentScoreArtifact
  readonly scores: Readonly<Record<ScoreDimension, number>>
}): number =>
  SCORE_DIMENSIONS.reduce((total, dimension) => total + artifact.compositeWeights[dimension] * scores[dimension], 0)

const applyPolicyCap = ({
  artifact,
  composite,
  safety,
}: {
  readonly artifact: AgentScoreArtifact
  readonly composite: number
  readonly safety: ProjectSafetyEstimate
}): { readonly score: number; readonly policyCap?: CompositePolicyCapResult } => {
  const cap = artifact.policyCap
  if (!cap) return { score: composite }
  const triggered = safety.harmedSessionCount > 0 && composite > cap.maxCompositeWithConfirmedHarm
  return {
    score: triggered ? cap.maxCompositeWithConfirmedHarm : composite,
    policyCap: {
      applied: triggered,
      cap: cap.maxCompositeWithConfirmedHarm,
      removedPoints: triggered ? composite - cap.maxCompositeWithConfirmedHarm : 0,
    },
  }
}

/**
 * The interval on the composite, drawn from every dimension's own uncertainty at once.
 *
 * Cost and Speed resample whole sessions, because a session's metrics are correlated with each
 * other and resampling metrics would understate the spread. The three endpoint dimensions redraw
 * their rate from the fitted posterior. One replicate does both, so a window where Cost is stable
 * and Outcome is thin produces an interval that says so.
 */
const bootstrapComposite = (input: ComposeAgentScoreInput): BinomialInterval => {
  const replicates = input.replicates ?? DEFAULT_COMPOSITE_REPLICATES
  const random = seededRandom(input.seed ?? 1)
  const interval = input.confidenceLevel ?? 0.95
  const models = {
    outcome: outcomeModel(input.outcome),
    reliability: reliabilityModel(input.reliability, input.artifact.referenceRuns.reliability),
    safety: safetyModel(input.safety, input.artifact.referenceRuns.safety),
  }
  const residualSignalPenalty = input.residualSignalPenalty ?? 0
  const residualAvoidableNs = input.residualAvoidableNs ?? 0
  const composites: number[] = []

  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const resampled =
      input.contributions.length === 0
        ? input.contributions
        : Array.from(
            { length: input.contributions.length },
            () => input.contributions[Math.floor(random() * input.contributions.length)] as SessionWindowContribution,
          )
    composites.push(
      weightedComposite({
        artifact: input.artifact,
        scores: {
          outcome: models.outcome.scoreAt(drawAdverseRate({ model: models.outcome, random })),
          reliability: models.reliability.scoreAt(drawAdverseRate({ model: models.reliability, random })),
          cost: aggregateWindowCost({
            contributions: resampled,
            artifact: input.costArtifact,
            residualSignalPenalty,
          }).cost,
          speed: aggregateWindowSpeed(resampled, residualAvoidableNs).speed,
          safety: models.safety.scoreAt(drawAdverseRate({ model: models.safety, random })),
        },
      }),
    )
  }

  composites.sort((left, right) => left - right)
  const tail = (1 - interval) / 2
  return { lower: percentile(composites, tail), upper: percentile(composites, 1 - tail) }
}

/**
 * The five dimensions, and the composite when every one of them can be published.
 *
 * Weights never redistribute. An unmeasured dimension does not become a zero, a hundred, or a
 * midpoint, and it does not hand its share to the others: the composite simply does not exist, and
 * neither does any dimension number, because a page showing four of five scores invites the reader
 * to average them. What every dimension still reports is what it observed and which floor stopped
 * it, which is the honest thing to put in the space where the number would have been.
 */
export const composeAgentScore = (input: ComposeAgentScoreInput): AgentScoreComposition => {
  const aggregates = {
    cost: aggregateWindowCost({
      contributions: input.contributions,
      artifact: input.costArtifact,
      ...(input.residualSignalPenalty !== undefined ? { residualSignalPenalty: input.residualSignalPenalty } : {}),
    }),
    speed: aggregateWindowSpeed(input.contributions, input.residualAvoidableNs ?? 0),
  }
  const dimensions = buildDimensions(input, aggregates)
  const unmeasuredDimensions = dimensions
    .filter((dimension) => dimension.coverage !== "measured")
    .map((dimension) => dimension.scoreDimension)

  if (unmeasuredDimensions.length > 0) {
    // Every dimension loses its number, not only the one that failed. Four scores beside one gap
    // invites the reader to average what is there and call it the score.
    return {
      dimensions: dimensions.map(
        (dimension): DimensionResult => ({
          scoreDimension: dimension.scoreDimension,
          weight: dimension.weight,
          coverage: dimension.coverage,
          ...(dimension.unmeasuredReason ? { unmeasuredReason: dimension.unmeasuredReason } : {}),
        }),
      ),
      unmeasuredDimensions,
      ...aggregates,
    }
  }

  const scores = Object.fromEntries(
    dimensions.map((dimension) => [dimension.scoreDimension, dimension.score ?? 0]),
  ) as Record<ScoreDimension, number>
  const weighted = weightedComposite({ artifact: input.artifact, scores })
  const { score, policyCap } = applyPolicyCap({ artifact: input.artifact, composite: weighted, safety: input.safety })

  return {
    dimensions,
    unmeasuredDimensions: [],
    ...aggregates,
    composite: {
      score,
      interval: bootstrapComposite(input),
      ...(policyCap ? { policyCap } : {}),
    },
  }
}
