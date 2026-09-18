import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import {
  COST_FAMILIES,
  type CostFamilyMeasurementState,
  type CostMetricMeasurementState,
} from "../entities/cost-evidence.ts"
import {
  type CostMetricReading,
  type SessionCostMetricEvidence,
  toSessionCostMetricEvidence,
} from "../entities/cost-metric-reading.ts"
import type {
  SessionAssessmentItem,
  SessionCostFamilySummary,
  SessionDimensionEffect,
  SessionDimensionSummary,
} from "../entities/session-assessment.ts"

export type SessionDimensionCoverage = SessionDimensionSummary["coverage"]

export interface BuildSessionDimensionSummariesInput {
  readonly items: readonly SessionAssessmentItem[]
  readonly coverage?: Partial<Readonly<Record<ScoreDimension, SessionDimensionCoverage>>>
  readonly observedMicrocents?: number
  readonly observedCriticalPathNs?: number
  /** Cost readings for the session. Family measurement state comes from these when present. */
  readonly costReadings?: readonly CostMetricReading[]
  readonly avoidable?: {
    readonly measuredMicrocents?: number
    readonly estimatedMicrocents?: number
    readonly measuredNs?: number
    readonly estimatedNs?: number
  }
}

const effectsForDimension = (
  items: readonly SessionAssessmentItem[],
  scoreDimension: ScoreDimension,
): SessionDimensionEffect[] =>
  items.flatMap((item) => item.effects.filter((effect) => effect.scoreDimension === scoreDimension))

const countsFor = (effects: readonly SessionDimensionEffect[]) => ({
  evidenceCounts: {
    positive: effects.filter((effect) => effect.direction === "positive").length,
    negative: effects.filter((effect) => effect.direction === "negative").length,
    context: effects.filter((effect) => effect.direction === "context").length,
  },
  measurementCounts: {
    observed: effects.filter((effect) => effect.measurement === "observed").length,
    estimated: effects.filter((effect) => effect.measurement === "estimated").length,
    notMeasured: effects.filter((effect) => effect.measurement === "notMeasured").length,
  },
})

const sumKnown = (values: readonly (number | undefined)[]): number | undefined => {
  const known = values.filter((value): value is number => value !== undefined)
  return known.length > 0 ? known.reduce((total, value) => total + value, 0) : undefined
}

const familyMeasurementStateOf = (states: readonly CostMetricMeasurementState[]): CostFamilyMeasurementState => {
  const measured = states.includes("measured")
  const unmeasured = states.includes("unmeasured")
  if (measured && unmeasured) return "partial"
  if (measured) return "measured"
  if (unmeasured || states.length === 0) return "unmeasured"
  return "notApplicable"
}

/**
 * One summary per family, including only aggregate session-safe metric evidence.
 */
const buildCostFamilySummaries = ({
  costEffects,
  costReadings,
}: {
  readonly costEffects: readonly SessionDimensionEffect[]
  readonly costReadings: readonly CostMetricReading[] | undefined
}): SessionCostFamilySummary[] =>
  COST_FAMILIES.map((family) => {
    const observedItemCount = costEffects.filter((effect) => effect.costEvaluation?.family === family).length
    const metrics: SessionCostMetricEvidence[] =
      costReadings?.filter((reading) => reading.family === family).map(toSessionCostMetricEvidence) ?? []
    const states =
      costReadings === undefined
        ? costEffects.flatMap((effect) =>
            effect.costEvaluation?.family === family ? [effect.costEvaluation.measurementState] : [],
          )
        : metrics.map((metric) => metric.measurementState)
    return { family, measurementState: familyMeasurementStateOf(states), observedItemCount, metrics }
  })

/**
 * The composed avoidable numbers when the Speed counterfactual and Cost readers ran, and the
 * per-effect sums otherwise.
 *
 * A composed total is preferred because it has already been deduplicated and capped; summing the
 * effects is only the fallback for a session read before those evaluators existed.
 */
const resolveAvoidable = ({
  costEffects,
  speedEffects,
  avoidable,
}: {
  readonly costEffects: readonly SessionDimensionEffect[]
  readonly speedEffects: readonly SessionDimensionEffect[]
  readonly avoidable: BuildSessionDimensionSummariesInput["avoidable"]
}) => {
  const spendOf = (measurement: SessionDimensionEffect["measurement"]) =>
    sumKnown(
      costEffects.map((effect) =>
        effect.measurement === measurement && effect.impact?.kind === "spend"
          ? effect.impact.avoidableMicrocents
          : undefined,
      ),
    )
  const durationOf = (measurement: SessionDimensionEffect["measurement"]) =>
    sumKnown(
      speedEffects.map((effect) =>
        effect.measurement === measurement && effect.impact?.kind === "duration"
          ? effect.impact.avoidableNs
          : undefined,
      ),
    )
  return {
    measuredAvoidableMicrocents: avoidable?.measuredMicrocents ?? spendOf("observed"),
    estimatedAvoidableMicrocents: avoidable?.estimatedMicrocents ?? spendOf("estimated"),
    measuredAvoidableNs: avoidable?.measuredNs ?? durationOf("observed"),
    estimatedAvoidableNs: avoidable?.estimatedNs ?? durationOf("estimated"),
  }
}

const baseSummary = <Dimension extends ScoreDimension>(
  dimension: Dimension,
  effects: readonly SessionDimensionEffect[],
  coverage: BuildSessionDimensionSummariesInput["coverage"],
) => {
  const dimensionCoverage: SessionDimensionCoverage = coverage?.[dimension] ?? "notExamined"
  return {
    scoreDimension: dimension,
    ...countsFor(effects),
    coverage: dimensionCoverage,
  }
}

export const buildSessionDimensionSummaries = ({
  items,
  coverage,
  observedMicrocents,
  observedCriticalPathNs,
  costReadings,
  avoidable,
}: BuildSessionDimensionSummariesInput): SessionDimensionSummary[] => {
  const effects = new Map(SCORE_DIMENSIONS.map((dimension) => [dimension, effectsForDimension(items, dimension)]))
  const outcomeEffects = effects.get("outcome") ?? []
  const reliabilityEffects = effects.get("reliability") ?? []
  const costEffects = effects.get("cost") ?? []
  const speedEffects = effects.get("speed") ?? []
  const safetyEffects = effects.get("safety") ?? []

  const taskOutcomes = outcomeEffects.flatMap((effect) =>
    effect.impact?.kind === "taskOutcome" ? [effect.impact] : [],
  )
  const taskVerdict = taskOutcomes.some((impact) => impact.verdict === "failure")
    ? "failure"
    : taskOutcomes.some((impact) => impact.verdict === "success")
      ? "success"
      : undefined
  const taskProbability = [...taskOutcomes].reverse().find((impact) => impact.probability !== undefined)?.probability

  const completions = reliabilityEffects.flatMap((effect) =>
    effect.impact?.kind === "completion" ? [effect.impact.status] : [],
  )
  const completion = completions.includes("terminalFailure")
    ? "terminalFailure"
    : completions.includes("usable")
      ? "usable"
      : "undetermined"
  const incidents = reliabilityEffects.flatMap((effect) =>
    effect.impact?.kind === "incident" ? [effect.impact.status] : [],
  )

  const { measuredAvoidableMicrocents, estimatedAvoidableMicrocents, measuredAvoidableNs, estimatedAvoidableNs } =
    resolveAvoidable({ costEffects, speedEffects, avoidable })
  const safetyStatuses = safetyEffects.flatMap((effect) =>
    effect.impact?.kind === "safety" ? [effect.impact.status] : [],
  )

  return [
    {
      ...baseSummary("outcome", outcomeEffects, coverage),
      ...(taskVerdict || taskProbability !== undefined
        ? {
            taskOutcome: {
              ...(taskVerdict ? { verdict: taskVerdict } : {}),
              ...(taskProbability !== undefined ? { probability: taskProbability } : {}),
            },
          }
        : {}),
    },
    {
      ...baseSummary("reliability", reliabilityEffects, coverage),
      completion,
      recoveredIncidentCount: incidents.filter((status) => status === "recovered").length,
      unrecoveredIncidentCount: incidents.filter((status) => status === "unrecovered").length,
    },
    {
      ...baseSummary("cost", costEffects, coverage),
      families: buildCostFamilySummaries({ costEffects, costReadings }),
      ...(observedMicrocents !== undefined ? { observedMicrocents } : {}),
      ...(measuredAvoidableMicrocents !== undefined ? { measuredAvoidableMicrocents } : {}),
      ...(estimatedAvoidableMicrocents !== undefined ? { estimatedAvoidableMicrocents } : {}),
    },
    {
      ...baseSummary("speed", speedEffects, coverage),
      ...(observedCriticalPathNs !== undefined ? { observedCriticalPathNs } : {}),
      ...(measuredAvoidableNs !== undefined ? { measuredAvoidableNs } : {}),
      ...(estimatedAvoidableNs !== undefined ? { estimatedAvoidableNs } : {}),
    },
    {
      ...baseSummary("safety", safetyEffects, coverage),
      exposureCount: safetyStatuses.filter((status) => status === "exposure").length,
      successfulDefenseCount: safetyStatuses.filter((status) => status === "successfulDefense").length,
      confirmedHarmCount: safetyStatuses.filter((status) => status === "confirmedHarm").length,
    },
  ]
}
