import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, formatPercent, type ScoreDimensionKey } from "./agent-score-format.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>
type PublicationDimension = Explanation["publication"]["dimensions"][number]
type ReadinessRequirement = Explanation["readiness"]["dimensions"][number]["requirements"][number]

export type ScoreReadinessState = "ready" | "collecting" | "actionNeeded"

export interface ScoreRequirementView {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly progress?: number
}

export interface DimensionReadinessView {
  readonly state: ScoreReadinessState
  readonly label: string
  readonly detail?: string
  readonly requirements: readonly ScoreRequirementView[]
}

export interface AgentScoreBlockerView {
  readonly dimension: ScoreDimensionKey
  readonly label: string
  readonly requirement: ScoreRequirementView
}

export type AgentScoreReadinessView =
  | { readonly kind: "notComputed"; readonly title: string; readonly detail: string }
  | { readonly kind: "sessions"; readonly title: string; readonly detail: string; readonly progress: number }
  | {
      readonly kind: "dimensions"
      readonly title: string
      readonly detail: string
      readonly readyDimensions: number
      readonly totalDimensions: number
      readonly blockers: readonly AgentScoreBlockerView[]
    }

const DIMENSION_LABELS: Readonly<Record<ScoreDimensionKey, string>> = {
  outcome: "Outcome quality",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
}

const COST_FAMILY_LABELS: Readonly<Record<string, string>> = {
  spend: "Model spend coverage",
  context: "Model input coverage",
  tools: "Tool-use coverage",
  memory: "Memory activity coverage",
  recovery: "Recovery history coverage",
}

const REQUIREMENT_LABELS: Readonly<Record<string, string>> = {
  eligibleSessions: "Eligible sessions",
  outcomeEvaluations: "Completed outcome evaluations",
  outcomeCoverage: "Eligible sessions evaluated for outcome",
  reliabilityReadableSessions: "Sessions with a clear completion status",
  reliabilityCoverage: "Eligible sessions with completion data",
  costReadableSessions: "Sessions with usable cost data",
  costCoverage: "Eligible sessions with usable cost data",
  speedCompleteSessions: "Sessions with complete timing data",
  speedCoverage: "Eligible sessions with complete timing data",
  speedObservedTime: "Usable execution time",
  safetyEvaluations: "Completed safety evaluations",
  safetyCoverage: "Eligible sessions evaluated for safety",
  safetyRateLimitedCoverage: "Rate-limited high-risk evaluations",
  safetyIncompatibleEvaluations: "Evaluations from older scoring versions",
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

const requirementLabel = (requirement: ReadinessRequirement): string =>
  requirement.metric === "costFamilyCoverage" && requirement.subject
    ? (COST_FAMILY_LABELS[requirement.subject] ?? "Cost data coverage")
    : (REQUIREMENT_LABELS[requirement.metric] ?? "Score requirement")

const requirementValue = (requirement: ReadinessRequirement): string => {
  if (requirement.kind === "availability") return requirement.met ? "Available" : "Missing"
  if (requirement.unit === "sessions") {
    const suffix = requirement.comparison === "atMost" ? " max" : ""
    return `${formatCount(requirement.current)} / ${formatCount(requirement.required)}${suffix}`
  }
  const suffix = requirement.comparison === "atMost" ? " max" : ""
  return `${formatPercent(requirement.current)} / ${formatPercent(requirement.required)}${suffix}`
}

const requirementProgress = (requirement: ReadinessRequirement): number | undefined => {
  if (requirement.kind === "availability" || requirement.comparison === "atMost") return undefined
  if (requirement.required === 0) return 1
  return Math.max(0, Math.min(1, requirement.current / requirement.required))
}

const toRequirementView = (requirement: ReadinessRequirement): ScoreRequirementView => {
  const progress = requirementProgress(requirement)
  return {
    id: `${requirement.metric}:${requirement.kind === "threshold" ? (requirement.subject ?? "all") : "all"}`,
    label: requirementLabel(requirement),
    value: requirementValue(requirement),
    ...(progress !== undefined ? { progress } : {}),
  }
}

const readinessDetail = (requirements: readonly ReadinessRequirement[]): string => {
  const metric = requirements[0]?.metric
  if (metric === "outcomeEvaluations" || metric === "outcomeCoverage") {
    return "Latitude evaluates sampled sessions automatically as new sessions finish."
  }
  if (metric === "safetyEvaluations" || metric === "safetyCoverage") {
    return "Latitude runs safety evaluations automatically as new sessions finish."
  }
  if (metric === "safetyRateLimitedCoverage") {
    return "Safety evaluations must complete without exceeding the rate-limit threshold."
  }
  if (metric === "safetyIncompatibleEvaluations") {
    return "Safety evaluations must use the current scoring version."
  }
  if (metric === "reliabilityReadableSessions" || metric === "reliabilityCoverage") {
    return "Capture final responses and provider errors for each session."
  }
  if (metric === "costFamilyCoverage" || metric === "costReadableSessions" || metric === "costCoverage") {
    return "Capture model usage and pricing data with each session."
  }
  if (metric === "speedObservedTime" || metric === "speedCompleteSessions" || metric === "speedCoverage") {
    return "Capture complete generation timing with each session."
  }
  return "More session evidence is needed for this dimension."
}

const readinessForDimension = (dimension: ScoreDimensionKey, explanation: Explanation) =>
  explanation.readiness.dimensions.find((entry) => entry.scoreDimension === dimension)

export const dimensionReadiness = (
  dimension: PublicationDimension | undefined,
  explanation: Explanation,
): DimensionReadinessView | undefined => {
  if (explanation.publication.status === "published") return undefined
  const readiness = dimension ? readinessForDimension(dimension.scoreDimension, explanation) : undefined
  if (!dimension || !readiness) return undefined
  if (dimension.coverage === "measured") return { state: "ready", label: "Ready", requirements: [] }

  const unmet = readiness.requirements.filter((requirement) => !requirement.met)
  const actionNeeded = unmet.some((requirement) => ACTION_NEEDED_METRICS.has(requirement.metric))
  return {
    state: actionNeeded ? "actionNeeded" : "collecting",
    label: actionNeeded ? "Action needed" : "Collecting data",
    detail: readinessDetail(unmet),
    requirements: unmet.map(toRequirementView),
  }
}

const blockerMetric = (dimension: PublicationDimension): string | undefined => {
  const reason = dimension.unmeasuredReason
  if (reason === "examinedFloor") {
    return dimension.scoreDimension === "safety" ? "safetyEvaluations" : "outcomeEvaluations"
  }
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

const blockerForDimension = (
  dimension: PublicationDimension,
  explanation: Explanation,
): AgentScoreBlockerView | undefined => {
  const readiness = readinessForDimension(dimension.scoreDimension, explanation)
  const unmet = readiness?.requirements.filter((requirement) => !requirement.met) ?? []
  const metric = blockerMetric(dimension)
  const requirement = unmet.find((entry) => entry.metric === metric) ?? unmet[0]
  if (!requirement) return undefined
  return {
    dimension: dimension.scoreDimension,
    label: DIMENSION_LABELS[dimension.scoreDimension],
    requirement: toRequirementView(requirement),
  }
}

export const agentScoreReadiness = (explanation: Explanation | null): AgentScoreReadinessView => {
  if (!explanation) {
    return {
      kind: "notComputed",
      title: "Evidence is not ready yet",
      detail: "Refresh to calculate score readiness from the latest sessions.",
    }
  }

  const sessionRequirement = explanation.readiness.sessionRequirement
  if (!sessionRequirement.met) {
    const remaining = Math.max(0, sessionRequirement.required - sessionRequirement.current)
    const progress = sessionRequirement.required > 0 ? sessionRequirement.current / sessionRequirement.required : 1
    return {
      kind: "sessions",
      title: `${formatCount(sessionRequirement.current)} of ${formatCount(sessionRequirement.required)} eligible sessions`,
      detail: `${formatCount(remaining)} more ${remaining === 1 ? "session is" : "sessions are"} needed in the current ${formatCount(explanation.window.stepDays)}-day window.`,
      progress: Math.max(0, Math.min(1, progress)),
    }
  }

  const dimensions = explanation.publication.dimensions
  const readyDimensions = dimensions.filter((dimension) => dimension.coverage === "measured").length
  const blockers = dimensions
    .filter((dimension) => dimension.coverage === "unmeasured")
    .map((dimension) => blockerForDimension(dimension, explanation))
    .filter((blocker): blocker is AgentScoreBlockerView => blocker !== undefined)

  return {
    kind: "dimensions",
    title: `${formatCount(readyDimensions)} of ${formatCount(dimensions.length)} dimensions ready`,
    detail: "Scores publish together when every dimension is ready.",
    readyDimensions,
    totalDimensions: dimensions.length,
    blockers,
  }
}
