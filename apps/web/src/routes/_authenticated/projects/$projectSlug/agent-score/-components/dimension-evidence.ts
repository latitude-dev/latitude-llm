import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import {
  formatCount,
  formatHours,
  formatPercent,
  oneSessionSuccessRate,
  type ScoreDimensionKey,
} from "./agent-score-format.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>
type Issue = Explanation["issues"]["outcome"][number]

export type EvidenceTone = "negative" | "positive" | "neutral"

export interface DimensionEvidenceRow {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly value: string
  readonly progress: number
  readonly tone: EvidenceTone
  readonly signal: boolean
}

export interface DimensionEvidence {
  readonly affected: readonly DimensionEvidenceRow[]
  readonly coverageGaps: readonly DimensionEvidenceRow[]
  readonly healthy: readonly DimensionEvidenceRow[]
  readonly context: readonly DimensionEvidenceRow[]
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

const humanize = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (character) => character.toUpperCase())

const formatNative = (effect: { readonly value: number; readonly unit: string }): string => {
  if (effect.unit === "nanoseconds") return formatHours(effect.value)
  if (effect.unit === "sessions") return `${formatCount(Math.round(effect.value))} sessions`
  if (effect.unit === "usd") return `$${effect.value.toFixed(2)}`
  return `${formatCount(Math.round(effect.value))} ${humanize(effect.unit).toLowerCase()}`
}

const coverageRow = ({
  id,
  label,
  covered,
  total,
  description,
}: {
  readonly id: string
  readonly label: string
  readonly covered: number
  readonly total: number
  readonly description: string
}): DimensionEvidenceRow => {
  const coverage = total > 0 ? covered / total : 0
  const healthy = coverage >= 0.999
  return {
    id,
    label,
    description,
    value: formatPercent(coverage, 0),
    progress: healthy ? 1 : 1 - coverage,
    tone: healthy ? "positive" : "neutral",
    signal: false,
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
    return {
      id: `${prefix}:${issue.issueKey}`,
      label: issue.label,
      description: `${formatCount(issue.examinedSessions)} examined · ${formatCount(issue.examinedAdverseSessions)} adverse${issue.ranked ? "" : " · unranked"}`,
      value:
        estimated === undefined
          ? `${formatCount(observed)} observed`
          : `${formatCount(Math.round(estimated))} sessions`,
      progress: clamp((estimated ?? observed) / maximum),
      tone: "negative" as const,
      signal: issue.signalIds.length > 0,
    }
  })
}

const endpointCoverage = (dimension: ScoreDimensionKey, explanation: Explanation): DimensionEvidenceRow | null => {
  const eligible = explanation.eligibleSessionCount
  if (dimension === "outcome") {
    return coverageRow({
      id: "outcome:endpoint-coverage",
      label: "Outcome verdict coverage",
      covered: explanation.coverage.outcomeExaminedSessions,
      total: eligible,
      description: `${formatCount(explanation.coverage.outcomeExaminedSessions)} of ${formatCount(eligible)} eligible sessions examined`,
    })
  }
  if (dimension === "safety") {
    return coverageRow({
      id: "safety:endpoint-coverage",
      label: "Safety examination coverage",
      covered: explanation.coverage.safetyExaminedSessions,
      total: eligible,
      description: `${formatCount(explanation.coverage.safetyExaminedSessions)} of ${formatCount(eligible)} eligible sessions examined`,
    })
  }
  if (dimension === "reliability") {
    return coverageRow({
      id: "reliability:endpoint-coverage",
      label: "Readable completion outcomes",
      covered: explanation.coverage.reliabilityReadableSessions,
      total: eligible,
      description: `${formatCount(explanation.coverage.reliabilityReadableSessions)} of ${formatCount(eligible)} eligible sessions readable`,
    })
  }
  if (dimension === "speed") {
    return coverageRow({
      id: "speed:endpoint-coverage",
      label: "Complete critical paths",
      covered: explanation.coverage.speed.completeSessionCount,
      total: eligible,
      description: `${formatCount(explanation.coverage.speed.incompleteSessionCount)} sessions had incomplete paths`,
    })
  }
  if (dimension === "cost") {
    return coverageRow({
      id: "cost:endpoint-coverage",
      label: "Publishable cost sessions",
      covered: explanation.coverage.cost.publishableSessionCount,
      total: explanation.coverage.cost.publishableSessionCount + explanation.coverage.cost.withheldSessionCount,
      description: `${formatCount(explanation.coverage.cost.withheldSessionCount)} sessions withheld for unreadable cost evidence`,
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
  const maximumDeficit = Math.max(1, ...(attribution?.rows.map((row) => row.attributedDeficit) ?? []))
  for (const row of attribution?.rows ?? []) {
    evidence.affected.push({
      id: `${dimension}:cause:${row.causeId}`,
      label: row.label,
      description: `${attribution?.method === "sampled" ? "Approximate " : ""}${row.evidence === "measured" ? "observed" : "associated"} effect across ${formatCount(row.observationCount)} sessions · ${row.attributedDeficit.toFixed(1)} points attributed · up to ${row.fixGain.toFixed(1)} recoverable`,
      value: row.signalId ? formatCount(row.observationCount) : formatNative(row.nativeEffect),
      progress: clamp(row.attributedDeficit / maximumDeficit),
      tone: "negative",
      signal: row.signalId !== undefined,
    })
  }
  if (attribution && attribution.residual > 0.05) {
    evidence.affected.push({
      id: `${dimension}:residual`,
      label: "Not yet explained",
      description: "Score deficit not assigned to a named cause",
      value: `-${attribution.residual.toFixed(1)} pts`,
      progress: clamp(attribution.residual / Math.max(1, attribution.totalDeficit)),
      tone: "negative",
      signal: false,
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

const addNativeMetric = (
  evidence: MutableEvidence,
  dimension: ScoreDimensionKey,
  snapshot: AgentScoreRecord | null,
  explanation: Explanation,
): void => {
  if (dimension === "speed" && explanation.native.avoidableCriticalPathNs > 0) {
    const observed = explanation.native.observedCriticalPathNs
    evidence.affected.unshift({
      id: "speed:avoidable-time",
      label: "Avoidable critical-path time",
      description: `${formatHours(observed)} observed across complete critical paths`,
      value: formatHours(explanation.native.avoidableCriticalPathNs),
      progress: observed > 0 ? clamp(explanation.native.avoidableCriticalPathNs / observed) : 0,
      tone: "negative",
      signal: false,
    })
  }

  const reliabilityScore = snapshot?.dimensions.reliability?.score
  if (dimension !== "reliability" || reliabilityScore === undefined || reliabilityScore >= 100) return
  const successRate = oneSessionSuccessRate(reliabilityScore)
  evidence.affected.unshift({
    id: "reliability:one-session-rate",
    label: "One-session completion",
    description: "Derived from the 20-session reliability score",
    value: formatPercent(successRate),
    progress: clamp(1 - successRate),
    tone: "negative",
    signal: false,
  })
}

const addCostFamilies = (evidence: MutableEvidence, dimension: ScoreDimensionKey, explanation: Explanation): void => {
  if (dimension !== "cost") return
  for (const family of explanation.coverage.cost.families) {
    const penalty = explanation.native.costFamilyPenalties[family.family] ?? 0
    if (penalty > 0) {
      evidence.affected.push({
        id: `cost:penalty:${family.family}`,
        label: `${humanize(family.family)} inefficiency`,
        description: `${formatCount(family.readableReadings)} readable of ${formatCount(family.applicableReadings)} applicable readings`,
        value: formatPercent(penalty),
        progress: clamp(penalty),
        tone: "negative",
        signal: false,
      })
    } else if (family.applicableReadings > 0 && family.meetsCoverageFloor) {
      evidence.healthy.push({
        id: `cost:healthy:${family.family}`,
        label: humanize(family.family),
        description: `${formatCount(family.readableReadings)} readings met the scoring requirements`,
        value: "No penalty",
        progress: 1,
        tone: "positive",
        signal: false,
      })
    }
    if (family.applicableReadings > 0 && !family.meetsCoverageFloor) {
      evidence.coverageGaps.push({
        id: `cost:coverage:${family.family}`,
        label: `${humanize(family.family)} coverage`,
        description: `${formatCount(family.readableReadings)} readable of ${formatCount(family.applicableReadings)} applicable readings`,
        value: formatPercent(family.coverage, 0),
        progress: 1 - family.coverage,
        tone: "neutral",
        signal: false,
      })
    }
  }
}

const addEndpointCoverage = (
  evidence: MutableEvidence,
  dimension: ScoreDimensionKey,
  explanation: Explanation,
): void => {
  const endpoint = endpointCoverage(dimension, explanation)
  if (!endpoint) return
  if (endpoint.tone === "positive") evidence.healthy.unshift(endpoint)
  else evidence.coverageGaps.unshift(endpoint)
}

const addReaderCoverage = (evidence: MutableEvidence, dimension: ScoreDimensionKey, explanation: Explanation): void => {
  for (const reader of explanation.coverage.readers) {
    if (reader.applicableSessions === 0 || !reader.scoreDimensions.includes(dimension)) continue
    const limitations = Object.entries(reader.limitations)
      .map(([reason, count]) => `${humanize(reason)} (${formatCount(count)})`)
      .join(", ")
    const row: DimensionEvidenceRow = {
      id: `${dimension}:reader:${reader.readerId}`,
      label: reader.label,
      description: limitations || `${formatCount(reader.fullyReadSessions)} sessions fully read`,
      value: formatPercent(reader.coverage, 0),
      progress: reader.coverage >= 0.999 ? 1 : clamp(1 - reader.coverage),
      tone: reader.coverage >= 0.999 ? "positive" : "neutral",
      signal: false,
    }
    if (reader.coverage >= 0.999 && limitations.length === 0) evidence.healthy.push(row)
    else evidence.coverageGaps.push(row)
  }
}

const addClearEndpoint = (evidence: MutableEvidence, dimension: ScoreDimensionKey, explanation: Explanation): void => {
  if (dimension === "outcome" && evidence.affected.length === 0 && explanation.coverage.outcomeExaminedSessions > 0) {
    evidence.healthy.push({
      id: "outcome:no-issues",
      label: "No ranked outcome issues",
      description: `${formatCount(explanation.coverage.outcomeExaminedSessions)} sessions examined`,
      value: "Clear",
      progress: 1,
      tone: "positive",
      signal: false,
    })
  }
  if (dimension === "safety" && evidence.affected.length === 0 && explanation.coverage.safetyExaminedSessions > 0) {
    evidence.healthy.push({
      id: "safety:no-harm",
      label: "No confirmed agent-caused harm",
      description: `${formatCount(explanation.coverage.safetyExaminedSessions)} sessions examined`,
      value: "Clear",
      progress: 1,
      tone: "positive",
      signal: false,
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
  addNativeMetric(evidence, dimension, snapshot, explanation)
  addCostFamilies(evidence, dimension, explanation)
  addEndpointCoverage(evidence, dimension, explanation)
  addReaderCoverage(evidence, dimension, explanation)
  addClearEndpoint(evidence, dimension, explanation)

  return evidence
}
