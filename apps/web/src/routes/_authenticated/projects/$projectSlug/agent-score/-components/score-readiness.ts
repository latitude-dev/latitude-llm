import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, formatPercent, SCORE_DIMENSION_ORDER, type ScoreDimensionKey } from "./agent-score-format.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>
type PublicationDimension = Explanation["publication"]["dimensions"][number]
type ReadinessRequirement = Explanation["readiness"]["dimensions"][number]["requirements"][number]

export type ScoreReadinessState = "ready" | "collecting" | "actionNeeded"

export interface DimensionReadinessRow {
  readonly dimension: ScoreDimensionKey
  readonly label: string
  readonly state: ScoreReadinessState
  readonly status: string
  readonly value?: string
}

export type AgentScoreReadinessView =
  | { readonly kind: "notComputed" }
  | {
      readonly kind: "sessions"
      readonly current: number
      readonly required: number
      readonly remaining: number
      readonly windowDays: number
      readonly progress: number
    }
  | {
      readonly kind: "dimensions"
      readonly readyDimensions: number
      readonly totalDimensions: number
      readonly rows: readonly DimensionReadinessRow[]
    }

const DIMENSION_LABELS: Readonly<Record<ScoreDimensionKey, string>> = {
  outcome: "Outcome quality",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
}

const ACTION_NEEDED_METRICS = new Set([
  "reliabilityReadableSessions",
  "reliabilityCoverage",
  "costReadableSessions",
  "costCoverage",
  "costFamilyCoverage",
  "speedCompleteSessions",
  "speedCoverage",
  "speedObservedTime",
  "safetyIncompatibleEvaluations",
])

const blockerMetric = (dimension: PublicationDimension): string | undefined => {
  const reason = dimension.unmeasuredReason
  if (reason === "examinedFloor") {
    return dimension.scoreDimension === "safety" ? "safetyEvaluations" : "outcomeEvaluations"
  }
  // Outcome and Safety stopped emitting `coverageFloor` in v6 — a share of eligible traffic is not
  // something their count-targeted sampler can reach. Reliability still does, and an older
  // snapshot still needs its blocker named, so the mapping stays.
  if (reason === "coverageFloor") {
    if (dimension.scoreDimension === "safety") return "safetyCoverage"
    if (dimension.scoreDimension === "reliability") return "reliabilityCoverage"
    return "outcomeCoverage"
  }
  if (reason === "readableFloor") return "reliabilityReadableSessions"
  if (reason === "requiredFamilyUnreadable") return "costFamilyCoverage"
  if (reason === "publishableSessionFloor") return "costCoverage"
  if (reason === "noReadableSessions") return "costReadableSessions"
  if (reason === "completePathFloor") return "speedCompleteSessions"
  if (reason === "completePathCoverageFloor") return "speedCoverage"
  if (reason === "noObservedTime") return "speedObservedTime"
  if (reason === "rateLimitedHintedFloor") return "safetyRateLimitedCoverage"
  if (reason === "incompatibleJudgment") return "safetyIncompatibleEvaluations"
  return undefined
}

const requirementStatus = (requirement: ReadinessRequirement): string => {
  if (requirement.metric === "outcomeEvaluations") return "Collecting direct evaluations"
  if (requirement.metric === "outcomeCoverage") return "Collecting evaluations"
  if (requirement.metric === "safetyEvaluations" || requirement.metric === "safetyCoverage") {
    return "Collecting evaluations"
  }
  if (requirement.metric === "safetyRateLimitedCoverage") return "Waiting for evaluation capacity"
  if (requirement.metric === "safetyIncompatibleEvaluations") return "Needs current evaluations"
  if (requirement.metric === "reliabilityReadableSessions" || requirement.metric === "reliabilityCoverage") {
    return "Needs completion data"
  }
  if (
    requirement.metric === "costFamilyCoverage" ||
    requirement.metric === "costReadableSessions" ||
    requirement.metric === "costCoverage"
  ) {
    return "Needs usage data"
  }
  if (
    requirement.metric === "speedObservedTime" ||
    requirement.metric === "speedCompleteSessions" ||
    requirement.metric === "speedCoverage"
  ) {
    return "Needs timing data"
  }
  return "Collecting data"
}

const requirementValue = (requirement: ReadinessRequirement): string => {
  if (requirement.kind === "availability") return requirement.met ? "Available" : "Missing"
  if (requirement.comparison === "atMost") {
    if (requirement.unit === "sessions") return `${formatCount(requirement.current)} incompatible`
    return `${formatPercent(requirement.current)} / ${formatPercent(requirement.required)} max`
  }
  if (requirement.unit !== "sessions") {
    return `${formatPercent(requirement.current)} / ${formatPercent(requirement.required)} coverage`
  }
  const suffix =
    requirement.metric === "outcomeEvaluations" || requirement.metric === "safetyEvaluations"
      ? " evaluated"
      : requirement.metric === "reliabilityReadableSessions" || requirement.metric === "costReadableSessions"
        ? " readable"
        : requirement.metric === "speedCompleteSessions"
          ? " complete"
          : " sessions"
  return `${formatCount(requirement.current)} / ${formatCount(requirement.required)}${suffix}`
}

const readinessForDimension = (dimension: ScoreDimensionKey, explanation: Explanation) =>
  explanation.readiness.dimensions.find((entry) => entry.scoreDimension === dimension)

const rowForDimension = (dimension: ScoreDimensionKey, explanation: Explanation): DimensionReadinessRow => {
  const publication = explanation.publication.dimensions.find((entry) => entry.scoreDimension === dimension)
  if (publication?.coverage === "measured") {
    return { dimension, label: DIMENSION_LABELS[dimension], state: "ready", status: "Ready" }
  }

  const unmet =
    readinessForDimension(dimension, explanation)?.requirements.filter((requirement) => !requirement.met) ?? []
  const metric = publication ? blockerMetric(publication) : undefined
  const requirement = unmet.find((entry) => entry.metric === metric) ?? unmet[0]
  if (!requirement) {
    return { dimension, label: DIMENSION_LABELS[dimension], state: "collecting", status: "Waiting for evidence" }
  }

  return {
    dimension,
    label: DIMENSION_LABELS[dimension],
    state: ACTION_NEEDED_METRICS.has(requirement.metric) ? "actionNeeded" : "collecting",
    status: requirementStatus(requirement),
    value: requirementValue(requirement),
  }
}

export const agentScoreReadiness = (explanation: Explanation | null): AgentScoreReadinessView => {
  if (!explanation) return { kind: "notComputed" }

  const sessionRequirement = explanation.readiness.sessionRequirement
  if (!sessionRequirement.met) {
    return {
      kind: "sessions",
      current: sessionRequirement.current,
      required: sessionRequirement.required,
      remaining: Math.max(0, sessionRequirement.required - sessionRequirement.current),
      windowDays: explanation.window.stepDays,
      progress:
        sessionRequirement.required > 0
          ? Math.max(0, Math.min(1, sessionRequirement.current / sessionRequirement.required))
          : 1,
    }
  }

  const rows = SCORE_DIMENSION_ORDER.map((dimension) => rowForDimension(dimension, explanation))
  return {
    kind: "dimensions",
    readyDimensions: rows.filter((row) => row.state === "ready").length,
    totalDimensions: rows.length,
    rows,
  }
}
