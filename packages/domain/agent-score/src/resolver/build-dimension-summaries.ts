import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import type {
  SessionAssessmentItem,
  SessionDimensionEffect,
  SessionDimensionSummary,
} from "../entities/session-assessment.ts"

export type SessionDimensionCoverage = SessionDimensionSummary["coverage"]

export interface BuildSessionDimensionSummariesInput {
  readonly items: readonly SessionAssessmentItem[]
  readonly coverage?: Partial<Readonly<Record<ScoreDimension, SessionDimensionCoverage>>>
  readonly observedMicrocents?: number
  readonly observedCriticalPathNs?: number
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

  const measuredAvoidableMicrocents = sumKnown(
    costEffects.map((effect) =>
      effect.measurement === "observed" && effect.impact?.kind === "spend"
        ? effect.impact.avoidableMicrocents
        : undefined,
    ),
  )
  const estimatedAvoidableMicrocents = sumKnown(
    costEffects.map((effect) =>
      effect.measurement === "estimated" && effect.impact?.kind === "spend"
        ? effect.impact.avoidableMicrocents
        : undefined,
    ),
  )
  const measuredAvoidableNs = sumKnown(
    speedEffects.map((effect) =>
      effect.measurement === "observed" && effect.impact?.kind === "duration" ? effect.impact.avoidableNs : undefined,
    ),
  )
  const estimatedAvoidableNs = sumKnown(
    speedEffects.map((effect) =>
      effect.measurement === "estimated" && effect.impact?.kind === "duration" ? effect.impact.avoidableNs : undefined,
    ),
  )
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
