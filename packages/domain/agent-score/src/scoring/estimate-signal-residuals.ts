import type { CostFamily } from "../entities/cost-evidence.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import {
  capResidualEffects,
  DEFAULT_RESIDUAL_SUPPORT,
  estimateResidualEffect,
  type MatchedSession,
  type ResidualEffect,
  type ResidualSupportFloors,
} from "./estimate-residual-effect.ts"

/**
 * A set of signals fitted as one treatment.
 *
 * Near-duplicate clusters describe the same behaviour from two angles, so fitting them separately
 * would let one deficit be claimed twice. The group is the unit of estimation; members share its
 * effect in proportion to how often each actually occurred.
 */
export interface SignalResidualGroup {
  readonly groupId: string
  readonly signalIds: readonly string[]
  /** Occurrence count per signal in the window, for splitting the group's effect. */
  readonly occurrencesBySignal: ReadonlyMap<string, number>
}

export interface CostSignalResidual {
  readonly signalId: string
  readonly groupId: string
  readonly family: CostFamily
  /** Share of the family's eligible units, already inside the artifact's residual cap. */
  readonly penaltyShare: number
  readonly support: ResidualEffect
}

export interface SpeedSignalResidual {
  readonly signalId: string
  readonly groupId: string
  readonly avoidableNs: number
  readonly support: ResidualEffect
}

export interface SignalResidualGap {
  readonly signalId: string
  readonly groupId: string
  readonly support: Extract<ResidualEffect, { readonly measured: false }>
}

const splitAcrossMembers = ({
  group,
  effect,
}: {
  readonly group: SignalResidualGroup
  readonly effect: number
}): Map<string, number> => {
  const totals = group.signalIds.map((signalId) => group.occurrencesBySignal.get(signalId) ?? 0)
  const total = totals.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    const even = group.signalIds.length > 0 ? effect / group.signalIds.length : 0
    return new Map(group.signalIds.map((signalId) => [signalId, even]))
  }
  return new Map(group.signalIds.map((signalId, index) => [signalId, effect * ((totals[index] as number) / total)]))
}

/**
 * Residual Cost effects for the signals no deterministic atom explained.
 *
 * The outcome each group is fitted against is the session's family penalty share, so the estimate
 * arrives already in the family's own terms and the artifact's total residual cap applies directly
 * to it. Groups whose comparison failed come back as gaps rather than zeros — "effect not yet
 * measured" is a different statement from "no effect", and only the first is honest here.
 */
export const estimateCostSignalResiduals = ({
  sessionsByFamily,
  groups,
  artifact,
  floors = DEFAULT_RESIDUAL_SUPPORT,
}: {
  /** Matched sessions per family, whose `outcome` is that family's penalty share for the session. */
  readonly sessionsByFamily: ReadonlyMap<CostFamily, readonly MatchedSession[]>
  readonly groups: readonly SignalResidualGroup[]
  readonly artifact: CostScoringArtifact
  readonly floors?: ResidualSupportFloors
}): { readonly residuals: readonly CostSignalResidual[]; readonly gaps: readonly SignalResidualGap[] } => {
  const measured = new Map<
    string,
    {
      readonly group: SignalResidualGroup
      readonly family: CostFamily
      readonly support: ResidualEffect
      readonly effect: number
    }
  >()
  const gaps: SignalResidualGap[] = []

  for (const group of groups) {
    for (const [family, sessions] of sessionsByFamily) {
      const support = estimateResidualEffect({ sessions, groupId: group.groupId, floors })
      if (!support.measured) continue
      const key = `${group.groupId} ${family}`
      measured.set(key, { group, family, support, effect: support.effect })
    }
    const anyMeasured = [...sessionsByFamily.keys()].some((family) => measured.has(`${group.groupId} ${family}`))
    if (anyMeasured) continue
    const firstSessions = [...sessionsByFamily.values()][0] ?? []
    const support = estimateResidualEffect({ sessions: firstSessions, groupId: group.groupId, floors })
    if (support.measured) continue
    for (const signalId of group.signalIds) gaps.push({ signalId, groupId: group.groupId, support })
  }

  const capped = capResidualEffects({
    effects: new Map([...measured.entries()].map(([key, entry]) => [key, entry.effect])),
    cap: artifact.residualSignalCap,
  })

  const residuals = [...measured.entries()].flatMap(([key, entry]) => {
    const groupEffect = capped.get(key) ?? 0
    return [...splitAcrossMembers({ group: entry.group, effect: groupEffect })].map(
      ([signalId, penaltyShare]): CostSignalResidual => ({
        signalId,
        groupId: entry.group.groupId,
        family: entry.family,
        penaltyShare,
        support: entry.support,
      }),
    )
  })

  return { residuals, gaps }
}

/**
 * Residual Speed effects, in nanoseconds of critical-path time.
 *
 * The same matched estimator, a different outcome, and deliberately no shared cap with Cost: a
 * family penalty share and a duration are not commensurable, and letting one bound the other would
 * mean a caching problem quietly limited how slow the agent was allowed to look. The Speed
 * counterfactual's own clamp to observed critical-path time is what bounds this.
 */
export const estimateSpeedSignalResiduals = ({
  sessions,
  groups,
  floors = DEFAULT_RESIDUAL_SUPPORT,
}: {
  /** Matched sessions whose `outcome` is avoidable critical-path nanoseconds for the session. */
  readonly sessions: readonly MatchedSession[]
  readonly groups: readonly SignalResidualGroup[]
  readonly floors?: ResidualSupportFloors
}): { readonly residuals: readonly SpeedSignalResidual[]; readonly gaps: readonly SignalResidualGap[] } => {
  const residuals: SpeedSignalResidual[] = []
  const gaps: SignalResidualGap[] = []

  for (const group of groups) {
    const support = estimateResidualEffect({ sessions, groupId: group.groupId, floors })
    if (!support.measured) {
      for (const signalId of group.signalIds) gaps.push({ signalId, groupId: group.groupId, support })
      continue
    }
    const windowAvoidableNs = support.effect * support.exposedWeight
    for (const [signalId, avoidableNs] of splitAcrossMembers({ group, effect: windowAvoidableNs })) {
      residuals.push({ signalId, groupId: group.groupId, avoidableNs, support })
    }
  }

  return { residuals, gaps }
}
