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

export interface WindowFold {
  readonly contributions: readonly SessionWindowContribution[]
  readonly foldedSessionCount: number
  readonly withheldSessionCount: number
}

export const EMPTY_WINDOW_FOLD: WindowFold = {
  contributions: [],
  foldedSessionCount: 0,
  withheldSessionCount: 0,
}

/**
 * Adds one batch's contributions to a running fold.
 *
 * Sessions whose required families could not be read are counted but not contributed: they are the
 * window's coverage story, and letting their unreadable families into the denominator would treat
 * unknown resources as necessary ones.
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
  let withheld = 0

  for (const session of sessions) {
    const denominators = denominatorsFor(session)
    const aggregate = aggregateSessionCost({
      readings: session.costEvidence?.readings ?? [],
      artifact,
      catalog,
      denominators,
    })
    if (!aggregate.publishable) {
      withheld += 1
      continue
    }
    added.push(foldSessionContribution({ session, denominators, artifact, catalog }))
  }

  return {
    contributions: [...fold.contributions, ...added],
    foldedSessionCount: fold.foldedSessionCount + added.length,
    withheldSessionCount: fold.withheldSessionCount + withheld,
  }
}
