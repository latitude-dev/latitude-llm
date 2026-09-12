import type { SafetyFindingKind } from "@domain/scores"
import type { ScoreEvidenceContract } from "@domain/shared"
import type {
  SessionAssessmentImpactLevel,
  SessionAssessmentItem,
  SessionAssessmentPolarity,
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

export interface ResolvedAssessmentItemOrder {
  readonly item: Pick<SessionAssessmentItem, "id" | "evidenceKey">
  readonly chronology: AssessmentFindingChronology
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

const safetyEffect = (
  role: "exposure" | "successfulDefense" | "confirmedHarm",
  findingKind: SafetyFindingKind,
): SessionDimensionEffect => ({
  scoreDimension: "safety",
  role,
  direction: role === "confirmedHarm" ? "negative" : role === "successfulDefense" ? "positive" : "context",
  measurement: "observed",
  // Only harm the agent caused enters the estimand. What reached the agent is
  // shown beside the score and never moves it.
  benchmarkUse: role === "confirmedHarm" ? "direct" : "contextOnly",
  impact: { kind: "safety", status: role === "confirmedHarm" ? "confirmedHarm" : role, findingKind },
})

/**
 * Attempt, response, and confirmation stay one item with several effects.
 *
 * An assistant disclosure carries no exposure effect: third-party data it
 * surfaced was never something the conversation received.
 */
const safetyFindingEffects = (findingKind: SafetyFindingKind): SessionDimensionEffect[] => {
  switch (findingKind) {
    case "injectionAttempt":
    case "piiExposure":
      return [safetyEffect("exposure", findingKind)]
    case "injectionDefense":
      return [safetyEffect("exposure", findingKind), safetyEffect("successfulDefense", findingKind)]
    case "injectionCompliance":
      return [safetyEffect("exposure", findingKind), safetyEffect("confirmedHarm", findingKind)]
    case "piiDisclosure":
      return [safetyEffect("confirmedHarm", findingKind)]
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
    case "safetyFinding":
      return safetyFindingEffects(finding.findingKind)
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

const normalizedGroupLabel = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, "-")

const findingGroupKey = (finding: AssessmentFinding): string => {
  const signalId = finding.signalIds[0]
  if (signalId) return `signal:${signalId}`

  switch (finding.kind) {
    case "usableCompletion":
      return "fact:usable-completion"
    case "noOutput":
      return `issue:no-output:${finding.findingKind}`
    case "outputDamage":
      return `issue:output-damage:${finding.findingKind}`
    case "toolFailure":
      return `issue:tool-failure:${normalizedGroupLabel(finding.label)}`
    case "toolStructuralDefect":
      return `issue:tool-structure:${finding.findingKind}:${normalizedGroupLabel(finding.label)}`
    case "toolRepetition":
      return "issue:tool-repetition"
    case "cacheGap":
      return "issue:cache-gap"
    case "finishFailure":
      return `issue:finish-failure:${finding.findingKind}`
    case "providerError":
      return `issue:provider-error:${finding.findingKind}`
    case "taskOutcome":
      return "fact:task-outcome"
    case "safetyFinding":
      return `issue:safety:${finding.findingKind}`
    case "classifiedJudgment":
    case "standaloneScore":
      return `judgment:${finding.scoreIds[0] ?? finding.evidenceKey}`
    case "moment":
      return finding.evidenceKey
  }
}

const findingPolarity = (
  finding: AssessmentFinding,
  effects: readonly SessionDimensionEffect[],
): SessionAssessmentPolarity => {
  switch (finding.kind) {
    case "usableCompletion":
      return "positive"
    case "noOutput":
      return finding.findingKind === "unconfirmedPattern" ? "unknown" : "negative"
    case "outputDamage":
    case "toolFailure":
    case "toolStructuralDefect":
    case "toolRepetition":
    case "cacheGap":
    case "finishFailure":
    case "providerError":
      return "negative"
    case "taskOutcome":
      return finding.verdict === "success" ? "positive" : "negative"
    case "safetyFinding":
      return finding.findingKind === "injectionDefense" ? "positive" : "negative"
    case "classifiedJudgment":
    case "standaloneScore":
      if (finding.signalOrigin === "system") return "negative"
      if (finding.judgmentKind !== "annotation") return "unknown"
      return finding.negative ? "negative" : "positive"
    case "moment":
      if (effects.some((effect) => effect.direction === "negative")) return "negative"
      if (effects.some((effect) => effect.direction === "positive")) return "positive"
      return "unknown"
  }
}

const hasHighImpact = (effects: readonly SessionDimensionEffect[]): boolean =>
  effects.some(
    (effect) =>
      (effect.impact?.kind === "taskOutcome" && effect.impact.verdict === "failure") ||
      (effect.impact?.kind === "completion" && effect.impact.status === "terminalFailure") ||
      (effect.impact?.kind === "incident" && effect.impact.status === "unrecovered") ||
      (effect.impact?.kind === "safety" && effect.impact.status === "confirmedHarm"),
  )

const findingImpactLevel = (
  finding: AssessmentFinding,
  effects: readonly SessionDimensionEffect[],
  polarity: SessionAssessmentPolarity,
): SessionAssessmentImpactLevel => {
  if (hasHighImpact(effects)) return "high"

  switch (finding.kind) {
    case "taskOutcome":
      return "high"
    // Confirmed harm already reads high through its effect; what is left is the
    // hostile input that arrived and the refusal that answered it.
    case "safetyFinding":
      return finding.findingKind === "injectionDefense" ? "low" : "medium"
    case "noOutput":
      return finding.findingKind === "unconfirmedPattern" ? "low" : "high"
    case "outputDamage":
      return finding.generationPosition === "final" ? "high" : "medium"
    case "toolFailure":
      return finding.terminal || !finding.recovered ? "high" : "medium"
    case "toolStructuralDefect":
      return finding.terminal ? "high" : "medium"
    case "finishFailure":
      return finding.generationPosition === "final" ? "high" : "medium"
    case "providerError":
      return finding.terminal || !finding.recovered ? "high" : "medium"
    case "usableCompletion":
    case "toolRepetition":
    case "classifiedJudgment":
    case "standaloneScore":
      return polarity === "unknown" ? "low" : "medium"
    case "cacheGap":
    case "moment":
      return "low"
  }
}

export const resolveAssessmentFinding = (finding: AssessmentFinding): ResolvedAssessmentItem => {
  const effects = resolveAssessmentFindingEffects(finding)
  const polarity = findingPolarity(finding, effects)
  return {
    item: {
      id: finding.independentHumanEvidence
        ? `human:${finding.scoreIds[0] ?? finding.evidenceKey}`
        : finding.evidenceKey,
      evidenceKey: finding.evidenceKey,
      groupKey: findingGroupKey(finding),
      label: finding.label,
      ...(finding.description ? { description: finding.description } : {}),
      ...(finding.chronology.occurredAt ? { occurredAt: finding.chronology.occurredAt } : {}),
      source: finding.source,
      polarity,
      impactLevel: findingImpactLevel(finding, effects, polarity),
      ...(finding.metricId ? { metricId: finding.metricId } : {}),
      signalIds: [...new Set(finding.signalIds)],
      scoreIds: [...new Set(finding.scoreIds)],
      occurrenceCount: finding.occurrenceCount,
      effects,
      anchors: deduplicate(finding.anchors, anchorKey),
      destinations: deduplicate(finding.destinations, destinationKey),
    },
    chronology: finding.chronology,
    independentHumanEvidence: finding.independentHumanEvidence,
  }
}

export const compareResolvedAssessmentItems = (
  left: ResolvedAssessmentItemOrder,
  right: ResolvedAssessmentItemOrder,
): number => {
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
  const byEvidenceKey = left.item.evidenceKey.localeCompare(right.item.evidenceKey)
  if (byEvidenceKey !== 0) return byEvidenceKey
  const leftIsPrimary = left.item.id === left.item.evidenceKey
  const rightIsPrimary = right.item.id === right.item.evidenceKey
  if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1
  return left.item.id.localeCompare(right.item.id)
}

const sourcePriority = {
  metric: 0,
  signal: 1,
  flagger: 2,
  score: 3,
  moment: 4,
} as const satisfies Record<SessionAssessmentItem["source"], number>

const benchmarkPriority = {
  direct: 0,
  modeled: 1,
  attributionOnly: 2,
  contextOnly: 3,
} as const satisfies Record<SessionDimensionEffect["benchmarkUse"], number>

const measurementPriority = {
  observed: 0,
  estimated: 1,
  notMeasured: 2,
} as const satisfies Record<SessionDimensionEffect["measurement"], number>

const effectKey = (effect: SessionDimensionEffect): string => `${effect.scoreDimension}:${effect.role}`

const preferEffect = (left: SessionDimensionEffect, right: SessionDimensionEffect): SessionDimensionEffect => {
  const byBenchmark = benchmarkPriority[left.benchmarkUse] - benchmarkPriority[right.benchmarkUse]
  if (byBenchmark !== 0) return byBenchmark < 0 ? left : right
  const byMeasurement = measurementPriority[left.measurement] - measurementPriority[right.measurement]
  return byMeasurement <= 0 ? left : right
}

const mergeEffects = (
  left: readonly SessionDimensionEffect[],
  right: readonly SessionDimensionEffect[],
): SessionDimensionEffect[] => {
  const effects = new Map<string, SessionDimensionEffect>()
  for (const effect of [...left, ...right]) {
    const key = effectKey(effect)
    const previous = effects.get(key)
    effects.set(key, previous ? preferEffect(previous, effect) : effect)
  }
  return [...effects.values()]
}

const polarityPriority = {
  positive: 0,
  unknown: 1,
  negative: 2,
} as const satisfies Record<SessionAssessmentPolarity, number>

const impactPriority = {
  low: 0,
  medium: 1,
  high: 2,
} as const satisfies Record<SessionAssessmentImpactLevel, number>

const mergePolarity = (left: SessionAssessmentPolarity, right: SessionAssessmentPolarity): SessionAssessmentPolarity =>
  polarityPriority[left] >= polarityPriority[right] ? left : right

const mergeImpactLevel = (
  left: SessionAssessmentImpactLevel,
  right: SessionAssessmentImpactLevel,
): SessionAssessmentImpactLevel => (impactPriority[left] >= impactPriority[right] ? left : right)

const mergeResolvedItems = (left: ResolvedAssessmentItem, right: ResolvedAssessmentItem): ResolvedAssessmentItem => {
  const primary = sourcePriority[left.item.source] <= sourcePriority[right.item.source] ? left : right
  const secondary = primary === left ? right : left
  const signalItem = [left, right].find(({ item }) => item.source === "signal")
  const chronology = compareResolvedAssessmentItems(left, right) <= 0 ? left.chronology : right.chronology
  return {
    item: {
      ...primary.item,
      ...(signalItem ? { label: signalItem.item.label } : {}),
      groupKey: signalItem?.item.groupKey ?? primary.item.groupKey,
      polarity: mergePolarity(left.item.polarity, right.item.polarity),
      impactLevel: mergeImpactLevel(left.item.impactLevel, right.item.impactLevel),
      ...(!primary.item.description && secondary.item.description ? { description: secondary.item.description } : {}),
      ...(chronology.occurredAt ? { occurredAt: chronology.occurredAt } : {}),
      ...(!primary.item.metricId && secondary.item.metricId ? { metricId: secondary.item.metricId } : {}),
      signalIds: [...new Set([...left.item.signalIds, ...right.item.signalIds])],
      scoreIds: [...new Set([...left.item.scoreIds, ...right.item.scoreIds])],
      occurrenceCount: Math.max(left.item.occurrenceCount, right.item.occurrenceCount),
      effects: mergeEffects(left.item.effects, right.item.effects),
      anchors: deduplicate([...left.item.anchors, ...right.item.anchors], anchorKey),
      destinations: deduplicate([...left.item.destinations, ...right.item.destinations], destinationKey),
    },
    chronology,
    independentHumanEvidence: false,
  }
}

export const deduplicateResolvedAssessmentItems = (
  resolved: readonly ResolvedAssessmentItem[],
): ResolvedAssessmentItem[] => {
  const automatic = new Map<string, ResolvedAssessmentItem>()
  const independent: ResolvedAssessmentItem[] = []
  for (const item of resolved) {
    if (item.independentHumanEvidence) {
      independent.push(item)
      continue
    }
    const previous = automatic.get(item.item.evidenceKey)
    automatic.set(item.item.evidenceKey, previous ? mergeResolvedItems(previous, item) : item)
  }
  return [...automatic.values(), ...independent]
}

export const resolveSessionAssessmentItems = (findings: readonly AssessmentFinding[]): SessionAssessmentItem[] =>
  resolveSessionAssessmentItemsWithChronology(findings).map(({ item }) => item)

export const resolveSessionAssessmentItemsWithChronology = (
  findings: readonly AssessmentFinding[],
): ResolvedAssessmentItem[] =>
  deduplicateResolvedAssessmentItems(findings.map(resolveAssessmentFinding)).sort(compareResolvedAssessmentItems)
