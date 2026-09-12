import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
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
  readonly inclusionProbability: number
  readonly fold: 0 | 1
  readonly familyPenaltyShare: Readonly<Record<CostFamily, number>>
  readonly avoidableNs: number
  /** Signals present on this session whose occurrence no charged atom already explains. */
  readonly unlinkedSignalIds: readonly string[]
  readonly linkedSignalIds: readonly string[]
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

/**
 * The probability this session's signals could have been seen on it.
 *
 * A deterministic reader runs on everything, so its occurrences carry one. A sampled reader's draw
 * is on the screening decision, and taking the lowest of them is the conservative reading: an
 * occurrence only exists if whatever found it was selected, and understating that probability
 * understates the signal's reach rather than inventing it.
 */
const inclusionProbabilityOf = (session: NormalizedSessionAssessmentInput): number => {
  const probabilities = session.screeningDecisions
    .map((decision) => decision.inclusionProbability)
    .filter((probability): probability is number => probability !== undefined && probability > 0)
  return probabilities.length === 0 ? 1 : Math.min(...probabilities)
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

  const occurrences: SignalOccurrence[] = []
  const atomIdsByFindingKey = new Map<string, readonly string[]>()
  for (const finding of session.findings) {
    if (finding.signalIds.length === 0) continue
    for (const signalId of finding.signalIds) {
      occurrences.push({ signalId, sessionId: session.sessionId, findingKey: finding.evidenceKey, atomIds: [] })
    }
  }
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
    inclusionProbability: inclusionProbabilityOf(session),
    fold: foldOf(session.sessionId),
    familyPenaltyShare,
    avoidableNs: (session.costEvidence?.measuredAvoidableNs ?? 0) + (session.costEvidence?.estimatedAvoidableNs ?? 0),
    unlinkedSignalIds: [...new Set(linkage.unlinked.map((occurrence) => occurrence.signalId))],
    linkedSignalIds: [...new Set(linkage.linked.map((entry) => entry.occurrence.signalId))],
  }
}

const toMatchedSessions = (
  evidence: readonly SessionSignalEvidence[],
  outcomeOf: (session: SessionSignalEvidence) => number,
): MatchedSession[] =>
  evidence.map((session) => ({
    sessionId: session.sessionId,
    stratum: session.stratum,
    outcome: outcomeOf(session),
    inclusionProbability: session.inclusionProbability,
    exposedGroupIds: session.unlinkedSignalIds,
    fold: session.fold,
  }))

/**
 * One group per signal.
 *
 * The specification asks for near-duplicate clusters to be fitted together, and nothing available at
 * window scale says which clusters are near-duplicates: the assessment carries signal ids, not the
 * similarity or merge relationships that would justify pooling two of them. Fitting each separately
 * is the conservative direction rather than the complete one, because the artifact's total residual
 * cap still bounds what all of them together can claim, and a weak comparison still shrinks toward
 * zero. Grouping becomes possible once a merge or similarity input reaches this layer.
 */
const groupsFor = (evidence: readonly SessionSignalEvidence[]): SignalResidualGroup[] => {
  const occurrences = new Map<string, number>()
  for (const session of evidence) {
    for (const signalId of session.unlinkedSignalIds) {
      occurrences.set(signalId, (occurrences.get(signalId) ?? 0) + 1)
    }
  }
  return [...occurrences.entries()].map(([signalId, count]) => ({
    groupId: signalId,
    signalIds: [signalId],
    occurrencesBySignal: new Map([[signalId, count]]),
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

  const sessionsByFamily = new Map<CostFamily, readonly MatchedSession[]>(
    COST_FAMILIES.map((family) => [
      family,
      toMatchedSessions(evidence, (session) => session.familyPenaltyShare[family]),
    ]),
  )
  const cost = estimateCostSignalResiduals({
    sessionsByFamily,
    groups,
    artifact,
    ...(floors ? { floors } : {}),
  })
  const speed = estimateSpeedSignalResiduals({
    sessions: toMatchedSessions(evidence, (session) => session.avoidableNs),
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
