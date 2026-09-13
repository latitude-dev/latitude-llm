import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { aggregateSessionCost, type CostFamilyDenominators } from "./aggregate-session-cost.ts"
import type { SessionWindowContribution } from "./bootstrap-window.ts"

/**
 * One session reduced to the numbers a window needs, and nothing else.
 *
 * Folding as each batch lands is what keeps a thousand-session window from having to be resident:
 * the contribution is a handful of numbers, so the session's items, ledger and critical path can be
 * released as soon as this is taken.
 */
export const foldSessionContribution = ({
  session,
  denominators,
  artifact,
  catalog,
}: {
  readonly session: NormalizedSessionAssessmentInput
  readonly denominators: CostFamilyDenominators
  readonly artifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
}): SessionWindowContribution => {
  const aggregate = aggregateSessionCost({
    readings: session.costEvidence?.readings ?? [],
    artifact,
    catalog,
    denominators,
  })
  const evidence = session.costEvidence

  return {
    sessionId: session.sessionId,
    costUsableForDenominator: aggregate.publishable,
    families: aggregate.families.map((family) => ({
      family: family.family,
      eligibleUnits: family.eligibleUnits,
      penalizedUnits: family.penalizedUnits,
    })),
    speed: {
      observedNs: evidence?.observedCriticalPathNs ?? 0,
      avoidableNs: (evidence?.measuredAvoidableNs ?? 0) + (evidence?.estimatedAvoidableNs ?? 0),
      usableForDenominator: evidence?.criticalPathComplete ?? false,
    },
  }
}

/** Applicable and readable metric readings for one family, pooled across the window's sessions. */
export interface FamilyReadingCoverage {
  readonly applicable: number
  readonly readable: number
}

export interface WindowFold {
  readonly contributions: readonly SessionWindowContribution[]
  readonly foldedSessionCount: number
  readonly withheldSessionCount: number
  /**
   * Counted rather than averaged: a coverage share cannot be added, so the window's coverage is the
   * pooled ratio over every applicable reading in it.
   */
  readonly familyCoverage: Readonly<Record<CostFamily, FamilyReadingCoverage>>
  /**
   * Penalized units per Cost metric and avoidable nanoseconds per Speed claim, pooled over the
   * window.
   *
   * Window totals rather than a per-session breakdown: attribution asks what a cause cost the
   * project, not what it cost each session, and keeping the breakdown resident would undo the point
   * of folding. Reliability is absent because its causes do not add up; overlapping terminal
   * findings need the session-level sets that `selectReliabilityEndpoint` already returns.
   */
  readonly costCauseUnits: ReadonlyMap<string, { readonly family: CostFamily; readonly penalizedUnits: number }>
  readonly speedCauseNs: ReadonlyMap<string, number>
}

const emptyFamilyCoverage = (): Record<CostFamily, FamilyReadingCoverage> =>
  Object.fromEntries(COST_FAMILIES.map((family) => [family, { applicable: 0, readable: 0 }])) as Record<
    CostFamily,
    FamilyReadingCoverage
  >

export const EMPTY_WINDOW_FOLD: WindowFold = {
  contributions: [],
  foldedSessionCount: 0,
  withheldSessionCount: 0,
  familyCoverage: emptyFamilyCoverage(),
  costCauseUnits: new Map(),
  speedCauseNs: new Map(),
}

/**
 * Adds one batch's contributions to a running fold.
 *
 * Sessions whose required Cost families could not be read are retained for Speed but excluded from
 * Cost: one dimension's missing evidence must not erase another dimension's readable evidence.
 */
export const foldWindowBatch = ({
  fold,
  sessions,
  denominatorsFor,
  artifact,
  catalog,
}: {
  readonly fold: WindowFold
  readonly sessions: readonly NormalizedSessionAssessmentInput[]
  readonly denominatorsFor: (session: NormalizedSessionAssessmentInput) => CostFamilyDenominators
  readonly artifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
}): WindowFold => {
  const added: SessionWindowContribution[] = []
  const costCauseUnits = new Map(fold.costCauseUnits)
  const speedCauseNs = new Map(fold.speedCauseNs)
  const familyCoverage = emptyFamilyCoverage()
  for (const family of COST_FAMILIES) {
    familyCoverage[family] = { ...fold.familyCoverage[family] }
  }
  let withheld = 0
  let published = 0

  for (const session of sessions) {
    // Coverage counts every session's readings, including a session whose required family could not
    // be read: that session is precisely what the window-level gate is measuring.
    for (const reading of session.costEvidence?.readings ?? []) {
      if (reading.applicability !== "applicable") continue
      const family = familyCoverage[reading.family]
      familyCoverage[reading.family] = {
        applicable: family.applicable + 1,
        readable: family.readable + (reading.readability === "readable" ? 1 : 0),
      }
    }

    const denominators = denominatorsFor(session)
    const aggregate = aggregateSessionCost({
      readings: session.costEvidence?.readings ?? [],
      artifact,
      catalog,
      denominators,
    })
    if (!aggregate.publishable) {
      withheld += 1
    } else {
      published += 1
      const familyOf = new Map((session.costEvidence?.readings ?? []).map((reading) => [reading.metricId, reading]))
      for (const [metricId, penalty] of aggregate.penaltiesByMetric) {
        const reading = familyOf.get(metricId)
        if (!reading) continue
        const eligibleUnits = denominators[reading.family]
        const existing = costCauseUnits.get(metricId)
        costCauseUnits.set(metricId, {
          family: reading.family,
          penalizedUnits: (existing?.penalizedUnits ?? 0) + penalty * eligibleUnits,
        })
      }
    }
    if (session.costEvidence?.criticalPathComplete) {
      for (const [cause, avoidableNs] of Object.entries(session.costEvidence.avoidableNsByCause)) {
        speedCauseNs.set(cause, (speedCauseNs.get(cause) ?? 0) + avoidableNs)
      }
    }
    added.push(foldSessionContribution({ session, denominators, artifact, catalog }))
  }

  return {
    contributions: [...fold.contributions, ...added],
    foldedSessionCount: fold.foldedSessionCount + published,
    withheldSessionCount: fold.withheldSessionCount + withheld,
    familyCoverage,
    costCauseUnits,
    speedCauseNs,
  }
}
