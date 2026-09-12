import { formatDuration, formatPrice } from "@repo/utils"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { findingDescription, findingLabel, formatCompactCount } from "../../-components/finding-format.ts"
import { formatCount, formatPercent, type ScoreDimensionKey } from "./agent-score-format.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>
type Issue = Explanation["issues"]["outcome"][number]

export type EvidenceTone = "negative" | "positive" | "neutral"

export interface DimensionEvidenceDetail {
  readonly label: string
  readonly value: string
}

export interface DimensionEvidenceRow {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly value: string
  readonly progress: number
  readonly tone: EvidenceTone
  readonly details?: readonly DimensionEvidenceDetail[]
  readonly signalId?: string
}

export interface DimensionEvidence {
  readonly affected: readonly DimensionEvidenceRow[]
  readonly coverageGaps: readonly DimensionEvidenceRow[]
  readonly healthy: readonly DimensionEvidenceRow[]
  readonly context: readonly DimensionEvidenceRow[]
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))
const MIN_VISIBLE_SCORE_IMPACT = 0.05

const DIMENSION_LABELS: Readonly<Record<ScoreDimensionKey, string>> = {
  outcome: "Outcome",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
}

const COST_FAMILY_LABELS: Readonly<Record<string, string>> = {
  spend: "Model spend",
  context: "Model input and context",
  tools: "Tool use",
  memory: "Memory use",
  recovery: "Error recovery",
}

const COST_FAMILY_COVERAGE_LABELS: Readonly<Record<string, string>> = {
  spend: "Priced model usage",
  context: "Readable model input",
  tools: "Readable tool calls",
  memory: "Readable memory activity",
  recovery: "Readable recovery history",
}

const COVERAGE_LABELS: Readonly<Record<string, string>> = {
  "Delivered output": "Sessions with a usable response",
  "Tool-call failures": "Sessions checked for failed tool calls",
  "Output structure": "Sessions checked for malformed output",
  "Repeated tool calls": "Sessions checked for repeated tool calls",
  "Spend pricing": "Sessions with pricing data",
  "Captured model input": "Sessions with readable model input",
  "Known model context limits": "Sessions with known context limits",
  "Critical-path reconstruction": "Sessions with complete timing data",
  "Time to first token": "Sessions with initial-response timing",
  "Generation throughput": "Sessions with response-generation timing",
  "Prompt cache use": "Sessions with cache data",
  "Generation finish reasons": "Sessions with a recorded finish reason",
  "Provider errors": "Sessions checked for provider errors",
}

const humanize = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (character) => character.toUpperCase())

const formatAttributedCount = (value: number): string =>
  value > 0 && value < 10 ? value.toFixed(1).replace(/\.0$/, "") : formatCompactCount(value)

const formatNative = (effect: { readonly value: number; readonly unit: string }): string => {
  if (effect.unit === "nanoseconds") return formatDuration(effect.value)
  if (effect.unit === "sessions") return `${formatCount(Math.round(effect.value))} sessions`
  if (effect.unit === "microcents" || effect.unit === "spend") return formatPrice(effect.value / 100_000_000)
  if (effect.unit === "context") return `${formatAttributedCount(effect.value)} tokens`
  if (effect.unit === "tools") return `${formatAttributedCount(effect.value)} call equivalents`
  if (effect.unit === "memory") return `${formatAttributedCount(effect.value)} operation equivalents`
  if (effect.unit === "recovery") return `${formatAttributedCount(effect.value)} session equivalents`
  if (effect.unit === "usd") return `$${effect.value.toFixed(2)}`
  return `${formatCompactCount(effect.value)} ${humanize(effect.unit).toLowerCase()}`
}

const attributionDetails = ({
  dimension,
  attributedDeficit,
  associated,
  windowDays,
}: {
  readonly dimension: ScoreDimensionKey
  readonly attributedDeficit: number
  readonly associated: boolean
  readonly windowDays: number
}): readonly DimensionEvidenceDetail[] => [
  { label: "Scoring window", value: `Last ${formatCount(windowDays)} days` },
  {
    label: associated
      ? `Associated impact on ${DIMENSION_LABELS[dimension]} score`
      : `Impact on ${DIMENSION_LABELS[dimension]} score`,
    value: `−${attributedDeficit.toFixed(1)} points`,
  },
]

const coverageRow = ({
  id,
  label,
  covered,
  total,
}: {
  readonly id: string
  readonly label: string
  readonly covered: number
  readonly total: number
}): DimensionEvidenceRow => {
  const coverage = total > 0 ? covered / total : 0
  const healthy = coverage >= 0.999
  return {
    id,
    label,
    value: formatPercent(coverage, 0),
    progress: healthy ? 1 : 1 - coverage,
    tone: healthy ? "positive" : "neutral",
  }
}

const issueRows = (
  prefix: string,
  issues: readonly Issue[],
  measure: "adverse" | "reach" = "adverse",
): readonly DimensionEvidenceRow[] => {
  const maximum = Math.max(
    1,
    ...issues.map((issue) =>
      measure === "reach"
        ? (issue.estimatedReach ?? issue.examinedSessions)
        : (issue.estimatedAdverseReach ?? issue.examinedAdverseSessions),
    ),
  )
  return issues.map((issue) => {
    const estimated = measure === "reach" ? issue.estimatedReach : issue.estimatedAdverseReach
    const observed = measure === "reach" ? issue.examinedSessions : issue.examinedAdverseSessions
    const description = findingDescription(issue.issueKey) ?? findingDescription(issue.label)
    return {
      id: `${prefix}:${issue.issueKey}`,
      label: findingLabel(issue.label),
      ...(description ? { description } : {}),
      value:
        estimated === undefined
          ? `${formatCount(observed)} observed`
          : `${formatCount(Math.round(estimated))} sessions`,
      progress: clamp((estimated ?? observed) / maximum),
      tone: "negative" as const,
      ...(issue.signalIds[0] ? { signalId: issue.signalIds[0] } : {}),
    }
  })
}

const endpointCoverage = (dimension: ScoreDimensionKey, explanation: Explanation): DimensionEvidenceRow | null => {
  const eligible = explanation.eligibleSessionCount
  if (dimension === "outcome") {
    return coverageRow({
      id: "outcome:endpoint-coverage",
      label: "Sessions evaluated for outcome",
      covered: explanation.coverage.outcomeExaminedSessions,
      total: eligible,
    })
  }
  if (dimension === "safety") {
    return coverageRow({
      id: "safety:endpoint-coverage",
      label: "Sessions evaluated for safety",
      covered: explanation.coverage.safetyExaminedSessions,
      total: eligible,
    })
  }
  if (dimension === "reliability") {
    return coverageRow({
      id: "reliability:endpoint-coverage",
      label: "Sessions with a clear completion status",
      covered: explanation.coverage.reliabilityReadableSessions,
      total: eligible,
    })
  }
  if (dimension === "speed") {
    return coverageRow({
      id: "speed:endpoint-coverage",
      label: "Sessions with complete timing data",
      covered: explanation.coverage.speed.completeSessionCount,
      total: eligible,
    })
  }
  if (dimension === "cost") {
    return coverageRow({
      id: "cost:endpoint-coverage",
      label: "Sessions with usable cost data",
      covered: explanation.coverage.cost.publishableSessionCount,
      total: explanation.coverage.cost.publishableSessionCount + explanation.coverage.cost.withheldSessionCount,
    })
  }
  return null
}

type MutableEvidence = {
  affected: DimensionEvidenceRow[]
  coverageGaps: DimensionEvidenceRow[]
  healthy: DimensionEvidenceRow[]
  context: DimensionEvidenceRow[]
}

const createEvidence = (): MutableEvidence => ({ affected: [], coverageGaps: [], healthy: [], context: [] })

const addAttribution = (evidence: MutableEvidence, dimension: ScoreDimensionKey, explanation: Explanation): void => {
  const attribution = explanation.attribution.find((entry) => entry.scoreDimension === dimension)
  const affectedRows = (attribution?.rows ?? []).filter((row) => row.attributedDeficit > MIN_VISIBLE_SCORE_IMPACT)
  const maximumDeficit = Math.max(1, ...affectedRows.map((row) => row.attributedDeficit))
  for (const row of affectedRows) {
    const description = findingDescription(row.causeId)
    evidence.affected.push({
      id: `${dimension}:cause:${row.causeId}`,
      label: row.signalId ? row.label : findingLabel(row.label),
      ...(description ? { description } : {}),
      details: attributionDetails({
        dimension,
        attributedDeficit: row.attributedDeficit,
        associated: row.evidence === "associated",
        windowDays: explanation.window.stepDays,
      }),
      value: row.signalId ? `${formatCount(row.observationCount)} sessions` : formatNative(row.nativeEffect),
      progress: clamp(row.attributedDeficit / maximumDeficit),
      tone: "negative",
      ...(row.signalId ? { signalId: row.signalId } : {}),
    })
  }
  if (attribution && attribution.residual > 0.05) {
    evidence.affected.push({
      id: `${dimension}:residual`,
      label: "Other score impact",
      description: "This portion of the score shortfall could not be assigned to a specific metric or signal.",
      value: `${attribution.residual.toFixed(1)} score points`,
      progress: clamp(attribution.residual / Math.max(1, attribution.totalDeficit)),
      tone: "negative",
    })
  }
}

const addIssues = (evidence: MutableEvidence, dimension: ScoreDimensionKey, explanation: Explanation): void => {
  if (dimension === "outcome") evidence.affected.push(...issueRows("outcome", explanation.issues.outcome))
  if (dimension === "safety") {
    evidence.affected.push(...issueRows("safety:harm", explanation.issues.safety.confirmedHarm))
    evidence.context.push(
      ...issueRows("safety:exposure", explanation.issues.safety.exposure, "reach").map((row) => ({
        ...row,
        tone: "neutral" as const,
      })),
    )
  }
}

const addCostFamilies = (evidence: MutableEvidence, dimension: ScoreDimensionKey, explanation: Explanation): void => {
  if (dimension !== "cost") return
  for (const family of explanation.coverage.cost.families) {
    const penalty = explanation.native.costFamilyPenalties[family.family] ?? 0
    if (penalty <= 0 && family.applicableReadings > 0 && family.meetsCoverageFloor) {
      evidence.healthy.push({
        id: `cost:healthy:${family.family}`,
        label: COST_FAMILY_LABELS[family.family] ?? humanize(family.family),
        value: "Within healthy range",
        progress: 1,
        tone: "positive",
      })
    }
    if (family.applicableReadings > 0 && !family.meetsCoverageFloor) {
      evidence.coverageGaps.push({
        id: `cost:coverage:${family.family}`,
        label: COST_FAMILY_COVERAGE_LABELS[family.family] ?? `${humanize(family.family)} data`,
        value: formatPercent(family.coverage, 0),
        progress: 1 - family.coverage,
        tone: "neutral",
      })
    }
  }
}

const addEndpointCoverage = (
  evidence: MutableEvidence,
  dimension: ScoreDimensionKey,
  snapshot: AgentScoreRecord | null,
  explanation: Explanation,
): void => {
  if (snapshot?.dimensions[dimension]?.score !== undefined) return
  const endpoint = endpointCoverage(dimension, explanation)
  if (!endpoint) return
  if (endpoint.tone !== "positive") evidence.coverageGaps.unshift(endpoint)
}

const addReaderCoverage = (evidence: MutableEvidence, dimension: ScoreDimensionKey, explanation: Explanation): void => {
  for (const reader of explanation.coverage.readers) {
    if (reader.applicableSessions === 0 || !reader.scoreDimensions.includes(dimension)) continue
    if (reader.coverage >= 0.999 && Object.keys(reader.limitations).length === 0) continue
    const row: DimensionEvidenceRow = {
      id: `${dimension}:reader:${reader.readerId}`,
      label: COVERAGE_LABELS[reader.label] ?? reader.label,
      value: formatPercent(reader.coverage, 0),
      progress: reader.coverage >= 0.999 ? 1 : clamp(1 - reader.coverage),
      tone: reader.coverage >= 0.999 ? "positive" : "neutral",
    }
    evidence.coverageGaps.push(row)
  }
}

const addClearEndpoint = (
  evidence: MutableEvidence,
  dimension: ScoreDimensionKey,
  snapshot: AgentScoreRecord | null,
  explanation: Explanation,
): void => {
  if (snapshot?.dimensions[dimension]?.score === undefined) return
  if (dimension === "outcome" && evidence.affected.length === 0 && explanation.coverage.outcomeExaminedSessions > 0) {
    evidence.healthy.push({
      id: "outcome:no-issues",
      label: "No outcome problems found",
      value: "Clear",
      progress: 1,
      tone: "positive",
    })
  }
  if (dimension === "safety" && evidence.affected.length === 0 && explanation.coverage.safetyExaminedSessions > 0) {
    evidence.healthy.push({
      id: "safety:no-harm",
      label: "No agent-caused harm found",
      value: "Clear",
      progress: 1,
      tone: "positive",
    })
  }
}

export function buildDimensionEvidence({
  dimension,
  snapshot,
  explanation,
}: {
  readonly dimension: ScoreDimensionKey
  readonly snapshot: AgentScoreRecord | null
  readonly explanation: Explanation
}): DimensionEvidence {
  const evidence = createEvidence()
  addAttribution(evidence, dimension, explanation)
  addIssues(evidence, dimension, explanation)
  addCostFamilies(evidence, dimension, explanation)
  addEndpointCoverage(evidence, dimension, snapshot, explanation)
  addReaderCoverage(evidence, dimension, explanation)
  addClearEndpoint(evidence, dimension, snapshot, explanation)

  return evidence
}
