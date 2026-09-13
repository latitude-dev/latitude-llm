import type { ScoreDimension } from "@domain/shared"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import type { MatchedSession, ResidualSupportFloors } from "./estimate-residual-effect.ts"
import {
  type CostSignalResidual,
  estimateCostSignalResiduals,
  estimateSpeedSignalResiduals,
  type SignalResidualGap,
  type SignalResidualGroup,
  type SpeedSignalResidual,
} from "./estimate-signal-residuals.ts"
import { linkSignalOccurrences, type SignalOccurrence } from "./link-signal-occurrences.ts"

/** One session reduced to what the matched estimator needs, and nothing that would keep it resident. */
export interface SessionSignalEvidence {
  readonly sessionId: string
  readonly stratum: string
  readonly fold: 0 | 1
  readonly familyPenaltyShare: Readonly<Record<CostFamily, number>>
  readonly avoidableNs: number
  /** Signals present on this session whose occurrence no charged atom already explains. */
  readonly unlinkedSignalIds: readonly string[]
  readonly inclusionProbabilityBySignalId: ReadonlyMap<string, number>
  readonly linkedSignalIds: readonly string[]
  readonly signals: readonly {
    readonly signalId: string
    readonly label: string
    readonly scoreDimensions: readonly ScoreDimension[]
  }[]
}

export interface WindowSignalEffects {
  /** Share of Cost the unlinked signals may add, already inside the artifact's residual cap. */
  readonly costPenalty: number
  readonly avoidableNs: number
  readonly costResiduals: readonly CostSignalResidual[]
  readonly speedResiduals: readonly SpeedSignalResidual[]
  /** Signals whose consequence could not be estimated. "Not yet measured" is not "no effect". */
  readonly gaps: readonly SignalResidualGap[]
  readonly linkedSignalIds: readonly string[]
}

export const EMPTY_WINDOW_SIGNAL_EFFECTS: WindowSignalEffects = {
  costPenalty: 0,
  avoidableNs: 0,
  costResiduals: [],
  speedResiduals: [],
  gaps: [],
  linkedSignalIds: [],
}

/** Deterministic from the session id, so the fit and the evaluation never share traffic across runs. */
const foldOf = (sessionId: string): 0 | 1 => {
  let hash = 0x811c9dc5
  for (let index = 0; index < sessionId.length; index++) {
    hash ^= sessionId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash & 1) as 0 | 1
}

const emptyShares = (): Record<CostFamily, number> =>
  Object.fromEntries(COST_FAMILIES.map((family) => [family, 0])) as Record<CostFamily, number>

const readFamilyPenaltyEvidence = (readings: readonly CostMetricReading[]) => {
  const ownedAtomsByFamily = new Map<CostFamily, Set<string>>()
  const familyPenaltyShare = emptyShares()

  for (const reading of readings) {
    if (reading.applicability !== "applicable" || reading.readability !== "readable") continue
    const owned = ownedAtomsByFamily.get(reading.family) ?? new Set<string>()
    for (const observation of reading.observations) {
      if (observation.adverseUnits > 0) owned.add(observation.atomId)
    }
    ownedAtomsByFamily.set(reading.family, owned)
    const eligibleUnits = reading.eligibleUnits ?? 0
    const adverseUnits = reading.adverseUnits ?? 0
    if (eligibleUnits > 0) {
      familyPenaltyShare[reading.family] = Math.max(
        familyPenaltyShare[reading.family],
        Math.min(1, adverseUnits / eligibleUnits),
      )
    }
  }

  return { ownedAtomsByFamily, familyPenaltyShare }
}

const signalOccurrences = (session: NormalizedSessionAssessmentInput): SignalOccurrence[] => {
  const eligibleSignalIds = new Set(session.scoringEligibleSignalIds)
  return session.findings.flatMap((finding) =>
    finding.signalIds.flatMap((signalId): SignalOccurrence[] => {
      if (!eligibleSignalIds.has(signalId)) return []
      return [
        {
          signalId,
          sessionId: session.sessionId,
          findingKey: finding.evidenceKey,
          atomIds: [],
          ...(finding.observationProbability !== undefined
            ? { inclusionProbability: finding.observationProbability }
            : {}),
        },
      ]
    }),
  )
}

const inclusionProbabilitiesOf = (occurrences: readonly SignalOccurrence[]): ReadonlyMap<string, number> => {
  const probabilities = new Map<string, number>()
  for (const occurrence of occurrences) {
    if (occurrence.inclusionProbability === undefined) continue
    probabilities.set(
      occurrence.signalId,
      Math.max(probabilities.get(occurrence.signalId) ?? 0, occurrence.inclusionProbability),
    )
  }
  return probabilities
}

const observedSignalsOf = (session: NormalizedSessionAssessmentInput): SessionSignalEvidence["signals"] => {
  const eligibleSignalIds = new Set(session.scoringEligibleSignalIds)
  const signals = new Map<string, { readonly label: string; readonly scoreDimensions: Set<ScoreDimension> }>()

  for (const finding of session.findings) {
    if (finding.kind !== "classifiedJudgment" || !finding.negative) continue
    for (const signalId of finding.signalIds) {
      if (!eligibleSignalIds.has(signalId)) continue
      const signal = signals.get(signalId) ?? { label: finding.label, scoreDimensions: new Set<ScoreDimension>() }
      for (const role of finding.roles) signal.scoreDimensions.add(role.scoreDimension)
      signals.set(signalId, signal)
    }
  }

  return [...signals.entries()].map(([signalId, signal]) => ({
    signalId,
    label: signal.label,
    scoreDimensions: [...signal.scoreDimensions],
  }))
}

/**
 * Splits a session's signal occurrences into the ones a family already charges and the rest.
 *
 * Linkage first, always. A signal that lands on an atom some metric already penalised is an
 * explanation of that penalty, and charging it again would bill one behaviour twice: once as a
 * metric and once as a cluster. Only what is left can enter the residual estimator.
 */
export const readSessionSignalEvidence = (session: NormalizedSessionAssessmentInput): SessionSignalEvidence => {
  const readings = session.costEvidence?.readings ?? []
  const { ownedAtomsByFamily, familyPenaltyShare } = readFamilyPenaltyEvidence(readings)
  const occurrences = signalOccurrences(session)
  const atomIdsByFindingKey = new Map<string, readonly string[]>()
  for (const reading of readings) {
    atomIdsByFindingKey.set(
      reading.metricId,
      reading.observations.map((observation) => observation.atomId),
    )
  }

  const linkage = linkSignalOccurrences({ occurrences, ownedAtomsByFamily, atomIdsByFindingKey })

  return {
    sessionId: session.sessionId,
    stratum: session.costEvidence?.workloadStratum ?? "unknown",
    fold: foldOf(session.sessionId),
    familyPenaltyShare,
    avoidableNs: (session.costEvidence?.measuredAvoidableNs ?? 0) + (session.costEvidence?.estimatedAvoidableNs ?? 0),
    unlinkedSignalIds: [...new Set(linkage.unlinked.map((occurrence) => occurrence.signalId))],
    inclusionProbabilityBySignalId: inclusionProbabilitiesOf(linkage.unlinked),
    linkedSignalIds: [...new Set(linkage.linked.map((entry) => entry.occurrence.signalId))],
    signals: observedSignalsOf(session),
  }
}

const toMatchedSessions = ({
  evidence,
  outcomeOf,
  groupOf,
}: {
  readonly evidence: readonly SessionSignalEvidence[]
  readonly outcomeOf: (session: SessionSignalEvidence) => number
  readonly groupOf: ReadonlyMap<string, string>
}): MatchedSession[] =>
  evidence.map((session) => {
    const exposedGroupIds = [...new Set(session.unlinkedSignalIds.flatMap((id) => groupOf.get(id) ?? []))]
    const inclusionProbabilityByGroupId = new Map<string, number>()
    for (const signalId of session.unlinkedSignalIds) {
      const groupId = groupOf.get(signalId)
      const probability = session.inclusionProbabilityBySignalId.get(signalId)
      if (groupId === undefined || probability === undefined) continue
      inclusionProbabilityByGroupId.set(groupId, Math.max(inclusionProbabilityByGroupId.get(groupId) ?? 0, probability))
    }

    return {
      sessionId: session.sessionId,
      stratum: session.stratum,
      outcome: outcomeOf(session),
      inclusionProbabilityByGroupId,
      exposedGroupIds,
      fold: session.fold,
    }
  })

/**
 * How alike two signals' occurrence sets must be before they are fitted as one treatment.
 *
 * Jaccard rather than equality, so a cluster that split into children covering almost the same
 * sessions still groups. High, because grouping two genuinely different signals hides one of them
 * behind the other, and that error is harder to see than the one it prevents.
 */
const SIGNAL_GROUPING_SIMILARITY = 0.8

/** Beyond this many unlinked signals the pairwise comparison stops being worth its cost. */
const MAX_PAIRWISE_SIGNALS = 200

const jaccard = (left: ReadonlySet<string>, right: ReadonlySet<string>): number => {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const value of left) if (right.has(value)) shared += 1
  return shared / (left.size + right.size - shared)
}

/**
 * Signals fitted together, grouped by the sessions they actually occurred on.
 *
 * Two signals present on the same sessions are indistinguishable to a matched estimator: fitting
 * each against the same clean comparison measures one difference twice, so a cluster somebody split
 * in two would contribute double until the residual cap bound it. `signals.md` requires the opposite
 * — splitting a cluster into equivalent children must not multiply its effect — and the occurrence
 * sets are what identify the duplication, without needing a merge pointer or a similarity model.
 *
 * Single-linkage, so a chain of near-duplicates collapses into one group rather than into pairs.
 */
const groupsFor = (evidence: readonly SessionSignalEvidence[]): SignalResidualGroup[] => {
  const sessionsBySignal = new Map<string, Set<string>>()
  for (const session of evidence) {
    for (const signalId of session.unlinkedSignalIds) {
      const sessions = sessionsBySignal.get(signalId) ?? new Set<string>()
      sessions.add(session.sessionId)
      sessionsBySignal.set(signalId, sessions)
    }
  }

  const signalIds = [...sessionsBySignal.keys()].sort()
  const parent = new Map(signalIds.map((signalId) => [signalId, signalId]))
  const find = (signalId: string): string => {
    let root = signalId
    while (parent.get(root) !== root) root = parent.get(root) as string
    return root
  }

  if (signalIds.length <= MAX_PAIRWISE_SIGNALS) {
    for (let left = 0; left < signalIds.length; left += 1) {
      for (let right = left + 1; right < signalIds.length; right += 1) {
        const first = signalIds[left] as string
        const second = signalIds[right] as string
        const similarity = jaccard(
          sessionsBySignal.get(first) as Set<string>,
          sessionsBySignal.get(second) as Set<string>,
        )
        if (similarity >= SIGNAL_GROUPING_SIMILARITY) parent.set(find(second), find(first))
      }
    }
  }

  const members = new Map<string, string[]>()
  for (const signalId of signalIds) {
    const root = find(signalId)
    members.set(root, [...(members.get(root) ?? []), signalId])
  }

  return [...members.entries()].map(([groupId, grouped]) => ({
    groupId,
    signalIds: grouped,
    occurrencesBySignal: new Map(
      grouped.map((signalId) => [signalId, (sessionsBySignal.get(signalId) as Set<string>).size]),
    ),
  }))
}

/**
 * What the window's unlinked signals add, in each dimension's own units.
 *
 * Cost arrives as a share of the family it was fitted against and Speed as nanoseconds, and the two
 * never meet: a family penalty share and a duration are not commensurable, and letting one bound the
 * other would mean a caching problem quietly limited how slow the agent was allowed to look.
 */
export const buildWindowSignalEffects = ({
  evidence,
  artifact,
  floors,
}: {
  readonly evidence: readonly SessionSignalEvidence[]
  readonly artifact: CostScoringArtifact
  readonly floors?: ResidualSupportFloors
}): WindowSignalEffects => {
  const groups = groupsFor(evidence)
  if (groups.length === 0) {
    return {
      ...EMPTY_WINDOW_SIGNAL_EFFECTS,
      linkedSignalIds: [...new Set(evidence.flatMap((session) => session.linkedSignalIds))],
    }
  }

  const groupOf = new Map(groups.flatMap((group) => group.signalIds.map((id) => [id, group.groupId] as const)))
  const sessionsByFamily = new Map<CostFamily, readonly MatchedSession[]>(
    COST_FAMILIES.map((family) => [
      family,
      toMatchedSessions({ evidence, groupOf, outcomeOf: (session) => session.familyPenaltyShare[family] }),
    ]),
  )
  const cost = estimateCostSignalResiduals({
    sessionsByFamily,
    groups,
    artifact,
    ...(floors ? { floors } : {}),
  })
  const speed = estimateSpeedSignalResiduals({
    sessions: toMatchedSessions({ evidence, groupOf, outcomeOf: (session) => session.avoidableNs }),
    groups,
    ...(floors ? { floors } : {}),
  })

  return {
    costPenalty: Math.min(
      artifact.residualSignalCap,
      cost.residuals.reduce((total, residual) => total + residual.penaltyShare, 0),
    ),
    avoidableNs: speed.residuals.reduce((total, residual) => total + residual.avoidableNs, 0),
    costResiduals: cost.residuals,
    speedResiduals: speed.residuals,
    gaps: [...cost.gaps, ...speed.gaps],
    linkedSignalIds: [...new Set(evidence.flatMap((session) => session.linkedSignalIds))],
  }
}
