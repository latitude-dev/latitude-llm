import type { ScoreEvidenceContract } from "@domain/shared"
import type {
  SessionAssessmentItem,
  SessionDimensionEffect,
  SessionEvidenceAnchor,
  SessionEvidenceDestination,
} from "../entities/session-assessment.ts"
import type { AssessmentFinding, AssessmentFindingChronology } from "../entities/session-assessment-input.ts"

export interface ResolvedAssessmentItem {
  readonly item: SessionAssessmentItem
  readonly chronology: AssessmentFindingChronology
  readonly independentHumanEvidence: boolean
}

const completionEffects = (status: "usable" | "terminalFailure"): SessionDimensionEffect[] => [
  {
    scoreDimension: "reliability",
    role: "completionOutcome",
    direction: status === "usable" ? "positive" : "negative",
    measurement: "observed",
    benchmarkUse: "direct",
    impact: { kind: "completion", status },
  },
]

const terminalOutcomeEffects = (): SessionDimensionEffect[] => [
  {
    scoreDimension: "outcome",
    role: "taskOutcome",
    direction: "negative",
    measurement: "observed",
    benchmarkUse: "direct",
    impact: { kind: "taskOutcome", verdict: "failure" },
  },
  ...completionEffects("terminalFailure"),
]

const incidentEffects = (input: {
  readonly recovered: boolean
  readonly sameSubjectRecovered?: boolean
  readonly observedMicrocents?: number
  readonly observedNs?: number
}): SessionDimensionEffect[] => [
  {
    scoreDimension: "reliability",
    role: "operationalIncident",
    direction: input.recovered ? "context" : "negative",
    measurement: "observed",
    benchmarkUse: "direct",
    impact: {
      kind: "incident",
      status: input.recovered ? "recovered" : "unrecovered",
      ...(input.sameSubjectRecovered !== undefined ? { sameSubjectRecovered: input.sameSubjectRecovered } : {}),
    },
  },
  {
    scoreDimension: "cost",
    role: "spendEfficiency",
    direction: "negative",
    measurement: input.observedMicrocents === undefined ? "notMeasured" : "observed",
    benchmarkUse: input.observedMicrocents === undefined ? "attributionOnly" : "direct",
    ...(input.observedMicrocents === undefined
      ? {}
      : {
          impact: {
            kind: "spend" as const,
            observedMicrocents: input.observedMicrocents,
            avoidableMicrocents: input.observedMicrocents,
          },
        }),
  },
  {
    scoreDimension: "speed",
    role: "criticalPathEfficiency",
    direction: "negative",
    measurement: input.observedNs === undefined ? "notMeasured" : "observed",
    benchmarkUse: input.observedNs === undefined ? "attributionOnly" : "direct",
    ...(input.observedNs === undefined
      ? {}
      : { impact: { kind: "duration" as const, observedNs: input.observedNs, avoidableNs: input.observedNs } }),
  },
]

const effectForClassifiedRole = (
  evidence: ScoreEvidenceContract,
  negative: boolean,
  findingKind?: string,
): SessionDimensionEffect => {
  switch (evidence.scoreDimension) {
    case "outcome":
      return {
        ...evidence,
        direction: negative ? "negative" : "context",
        measurement: "notMeasured",
        benchmarkUse: "modeled",
        impact: { kind: "outcomeAssociation" },
      }
    case "reliability":
      return {
        ...evidence,
        direction: negative ? "negative" : "context",
        measurement: "notMeasured",
        benchmarkUse: "attributionOnly",
      }
    case "cost":
    case "speed":
      return {
        ...evidence,
        direction: negative ? "negative" : "context",
        measurement: "notMeasured",
        benchmarkUse: negative ? "modeled" : "contextOnly",
      }
    case "safety":
      return {
        ...evidence,
        direction:
          evidence.role === "successfulDefense" ? "positive" : evidence.role === "exposure" ? "context" : "negative",
        measurement: evidence.role === "confirmedHarm" ? "notMeasured" : "observed",
        benchmarkUse: evidence.role === "confirmedHarm" ? "attributionOnly" : "contextOnly",
        ...(evidence.role === "confirmedHarm"
          ? {}
          : {
              impact: {
                kind: "safety" as const,
                status: evidence.role,
                findingKind: findingKind ?? "signal",
              },
            }),
      }
  }
}

const momentEffects = (momentKinds: readonly string[]): SessionDimensionEffect[] => {
  const strongNegativeKinds = new Set(["abandonment", "user_frustration", "user_correction", "clarification_loop"])
  const positiveKinds = new Set(["resolution", "user_satisfaction"])
  const hasNegative = momentKinds.some((kind) => strongNegativeKinds.has(kind))
  const hasPositive = momentKinds.some((kind) => positiveKinds.has(kind))
  const hasWeakFailure = momentKinds.some((kind) => kind === "hesitation" || kind === "stalling")
  const effects: SessionDimensionEffect[] = []

  if (hasNegative || hasPositive || hasWeakFailure) {
    effects.push({
      scoreDimension: "outcome",
      role: "taskOutcome",
      direction: hasNegative || hasWeakFailure ? "negative" : "positive",
      measurement: "estimated",
      benchmarkUse: "modeled",
      impact: { kind: "outcomeAssociation" },
    })
  }
  if (hasWeakFailure) {
    effects.push({
      scoreDimension: "speed",
      role: "criticalPathEfficiency",
      direction: "negative",
      measurement: "notMeasured",
      benchmarkUse: "attributionOnly",
    })
  }
  return effects
}

export const resolveAssessmentFindingEffects = (finding: AssessmentFinding): SessionDimensionEffect[] => {
  switch (finding.kind) {
    case "usableCompletion":
      return completionEffects("usable")
    case "noOutput":
      return finding.findingKind === "unconfirmedPattern"
        ? [
            {
              scoreDimension: "outcome",
              role: "taskOutcome",
              direction: "context",
              measurement: "notMeasured",
              benchmarkUse: "modeled",
              impact: { kind: "outcomeAssociation" },
            },
          ]
        : terminalOutcomeEffects()
    case "outputDamage":
      return finding.generationPosition === "final"
        ? terminalOutcomeEffects()
        : [
            {
              scoreDimension: "reliability",
              role: "operationalIncident",
              direction: "context",
              measurement: "observed",
              benchmarkUse: "attributionOnly",
            },
          ]
    case "toolFailure":
      return incidentEffects({
        recovered: finding.recovered,
        ...(finding.sameSubjectRecovered !== undefined ? { sameSubjectRecovered: finding.sameSubjectRecovered } : {}),
      })
    case "toolStructuralDefect":
      return finding.terminal ? terminalOutcomeEffects().slice(1) : incidentEffects({ recovered: true }).slice(0, 1)
    case "toolRepetition":
      return [
        {
          scoreDimension: "cost",
          role: "spendEfficiency",
          direction: "negative",
          measurement: "notMeasured",
          benchmarkUse: "modeled",
          impact: { kind: "observation", value: finding.occurrenceCount, unit: "calls" },
        },
        {
          scoreDimension: "speed",
          role: "criticalPathEfficiency",
          direction: "negative",
          measurement: "notMeasured",
          benchmarkUse: "modeled",
          impact: { kind: "observation", value: finding.occurrenceCount, unit: "calls" },
        },
      ]
    case "cacheGap":
      return [
        {
          scoreDimension: "cost",
          role: "spendEfficiency",
          direction: "negative",
          measurement: "notMeasured",
          benchmarkUse: "modeled",
        },
      ]
    case "finishFailure":
      return finding.generationPosition === "final"
        ? terminalOutcomeEffects()
        : [
            {
              scoreDimension: "speed",
              role: "criticalPathEfficiency",
              direction: "negative",
              measurement: "observed",
              benchmarkUse: "direct",
              impact: { kind: "duration", observedNs: finding.observedNs, avoidableNs: finding.observedNs },
            },
          ]
    case "providerError":
      return incidentEffects({
        recovered: finding.recovered,
        sameSubjectRecovered: finding.sameSubjectRecovered,
        observedMicrocents: finding.observedMicrocents,
        observedNs: finding.observedNs,
      })
    case "taskOutcome":
      return [
        {
          scoreDimension: "outcome",
          role: "taskOutcome",
          direction: finding.verdict === "success" ? "positive" : "negative",
          measurement: "observed",
          benchmarkUse: "direct",
          impact: { kind: "taskOutcome", verdict: finding.verdict },
        },
      ]
    case "classifiedJudgment":
      return finding.roles.map((role) => effectForClassifiedRole(role, finding.negative, finding.findingKind))
    case "standaloneScore":
      return []
    case "moment":
      return momentEffects(finding.momentKinds)
  }
}

const deduplicate = <Value>(values: readonly Value[], key: (value: Value) => string): Value[] => {
  const seen = new Set<string>()
  return values.filter((value) => {
    const identity = key(value)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

const anchorKey = (anchor: SessionEvidenceAnchor): string => JSON.stringify(anchor)
const destinationKey = (destination: SessionEvidenceDestination): string => JSON.stringify(destination)

export const resolveAssessmentFinding = (finding: AssessmentFinding): ResolvedAssessmentItem => ({
  item: {
    id: finding.evidenceKey,
    evidenceKey: finding.evidenceKey,
    label: finding.label,
    ...(finding.description ? { description: finding.description } : {}),
    source: finding.source,
    ...(finding.metricId ? { metricId: finding.metricId } : {}),
    signalIds: [...new Set(finding.signalIds)],
    scoreIds: [...new Set(finding.scoreIds)],
    occurrenceCount: finding.occurrenceCount,
    effects: resolveAssessmentFindingEffects(finding),
    anchors: deduplicate(finding.anchors, anchorKey),
    destinations: deduplicate(finding.destinations, destinationKey),
  },
  chronology: finding.chronology,
  independentHumanEvidence: finding.independentHumanEvidence,
})

export const compareResolvedAssessmentItems = (left: ResolvedAssessmentItem, right: ResolvedAssessmentItem): number => {
  const leftAt = left.chronology.occurredAt?.getTime()
  const rightAt = right.chronology.occurredAt?.getTime()
  if (leftAt !== undefined || rightAt !== undefined) {
    if (leftAt === undefined) return 1
    if (rightAt === undefined) return -1
    if (leftAt !== rightAt) return leftAt - rightAt
  }
  const leftMessage = left.chronology.messageIndex
  const rightMessage = right.chronology.messageIndex
  if (leftMessage !== undefined || rightMessage !== undefined) {
    if (leftMessage === undefined) return 1
    if (rightMessage === undefined) return -1
    if (leftMessage !== rightMessage) return leftMessage - rightMessage
  }
  return left.item.evidenceKey.localeCompare(right.item.evidenceKey)
}

export const resolveSessionAssessmentItems = (findings: readonly AssessmentFinding[]): SessionAssessmentItem[] =>
  findings
    .map(resolveAssessmentFinding)
    .sort(compareResolvedAssessmentItems)
    .map(({ item }) => item)
