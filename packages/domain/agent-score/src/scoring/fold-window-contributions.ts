import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { LatencyModel, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
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
  const criticalPathComplete = evidence?.criticalPathComplete ?? false
  const missingLatencyReference = criticalPathComplete && (evidence?.unreferencedLatencyModels.length ?? 0) > 0

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
      usableForDenominator: criticalPathComplete && !missingLatencyReference,
      missingLatencyReference,
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
   *
   * Only causes that charged something appear. A metric read as healthy is evidence the window was
   * measured, which coverage already reports, and never a cause with a zero effect.
   */
  readonly costCauseUnits: ReadonlyMap<string, { readonly family: CostFamily; readonly penalizedUnits: number }>
  readonly speedCauseNs: ReadonlyMap<string, number>
  /** Models kept out of Speed for lacking a latency reference, with the sessions each excluded. */
  readonly unreferencedLatencyModels: ReadonlyMap<string, UnreferencedLatencyModel>
}

export interface UnreferencedLatencyModel extends LatencyModel {
  readonly sessionCount: number
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
  unreferencedLatencyModels: new Map(),
}

/**
 * Adds one session's Cost claims to the window's running totals, in the family's own units.
 *
 * A metric read as healthy resolves to a zero penalty, and a metric whose family had nothing
 * eligible charges against nothing. Neither is recorded: a cause with a zero effect would reach the
 * page as a row naming zero wasted tokens beside the rows that name real ones, and the page cannot
 * tell somebody a metric came back clean while listing it as something the score is affected by.
 */
const recordCostCauses = ({
  costCauseUnits,
  penaltiesByMetric,
  readings,
  denominators,
}: {
  readonly costCauseUnits: Map<string, { readonly family: CostFamily; readonly penalizedUnits: number }>
  readonly penaltiesByMetric: ReadonlyMap<string, number>
  readonly readings: readonly CostMetricReading[]
  readonly denominators: CostFamilyDenominators
}): void => {
  const readingOf = new Map(readings.map((reading) => [reading.metricId, reading]))
  for (const [metricId, penalty] of penaltiesByMetric) {
    const reading = readingOf.get(metricId)
    if (!reading) continue
    const penalizedUnits = penalty * denominators[reading.family]
    if (penalizedUnits <= 0) continue
    const existing = costCauseUnits.get(metricId)
    costCauseUnits.set(metricId, {
      family: reading.family,
      penalizedUnits: (existing?.penalizedUnits ?? 0) + penalizedUnits,
    })
  }
}

/** Same rule as Cost: a Speed claim that found no avoidable time did not cause anything. */
const recordSpeedCauses = (speedCauseNs: Map<string, number>, avoidableNsByCause: Readonly<Record<string, number>>) => {
  for (const [cause, avoidableNs] of Object.entries(avoidableNsByCause)) {
    if (avoidableNs <= 0) continue
    speedCauseNs.set(cause, (speedCauseNs.get(cause) ?? 0) + avoidableNs)
  }
}

const recordUnreferencedModels = (
  unreferenced: Map<string, UnreferencedLatencyModel>,
  models: readonly LatencyModel[],
) => {
  for (const { provider, model } of models) {
    const key = `${provider} ${model}`
    unreferenced.set(key, { provider, model, sessionCount: (unreferenced.get(key)?.sessionCount ?? 0) + 1 })
  }
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
  const unreferencedLatencyModels = new Map(fold.unreferencedLatencyModels)
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
      recordCostCauses({
        costCauseUnits,
        penaltiesByMetric: aggregate.penaltiesByMetric,
        readings: session.costEvidence?.readings ?? [],
        denominators,
      })
    }
    const contribution = foldSessionContribution({ session, denominators, artifact, catalog })
    if (session.costEvidence && contribution.speed.usableForDenominator) {
      recordSpeedCauses(speedCauseNs, session.costEvidence.avoidableNsByCause)
    }
    if (session.costEvidence && contribution.speed.missingLatencyReference) {
      recordUnreferencedModels(unreferencedLatencyModels, session.costEvidence.unreferencedLatencyModels)
    }
    added.push(contribution)
  }

  return {
    contributions: [...fold.contributions, ...added],
    foldedSessionCount: fold.foldedSessionCount + published,
    withheldSessionCount: fold.withheldSessionCount + withheld,
    familyCoverage,
    costCauseUnits,
    speedCauseNs,
    unreferencedLatencyModels,
  }
}
