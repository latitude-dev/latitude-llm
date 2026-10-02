import { CAUSE_EXAMPLE_SESSION_LIMIT } from "../constants.ts"
import type { DimensionAttribution, DimensionCauseRow } from "./attribute-dimensions.ts"
import type { OutcomeDegradationEstimate } from "./estimate-outcome.ts"

interface AttributeOutcomeWindowInput {
  /** Degrading kinds per analyzed session, restricted to the sessions the estimator scored. */
  readonly degradedKindsBySession: ReadonlyMap<string, readonly string[]>
  readonly degradation: OutcomeDegradationEstimate
  /** The published Outcome, which the counterfactuals are measured against. */
  readonly observedScore: number
}

const EMPTY: DimensionAttribution = {
  scoreDimension: "outcome",
  rows: [],
  residual: 0,
  totalDeficit: 0,
  explainedDeficit: 0,
  method: "exact",
}

/**
 * How Outcome's degradation deficit divides across the moment kinds that caused it.
 *
 * Exact Shapley without the permutation machinery, because the game has a closed form. A session is
 * degraded when *any* of its kinds fires, so every firing kind is individually sufficient and they
 * are symmetric: the Shapley value of each on a session with `k` firing kinds is `1 / k`, and the
 * shares add to one session. Summing that over the degraded sessions divides the deficit exactly,
 * which is what lets the rows be ranked against each other.
 *
 * `fixGain` is the different question — what the score would be if this kind alone stopped
 * degrading sessions. A session degraded by two kinds is not rescued by removing one, so fix gains
 * overlap and must never be summed. Both numbers are reported because they answer different things:
 * one ranks, the other predicts.
 */
export const attributeOutcomeWindow = (input: AttributeOutcomeWindowInput): DimensionAttribution => {
  const { degradation } = input
  if (!degradation.applied || degradation.degradedSessionCount === 0) return EMPTY

  const loss = 1 - degradation.degradedWeight
  // The observed score already carries the degradation factor, so dividing it out recovers what the
  // dimension would have read with nothing degraded — the healthy counterfactual these rows explain.
  const undegraded = input.observedScore / (1 - loss * degradation.degradedShare)
  const totalDeficit = undegraded - input.observedScore

  const shares = new Map<string, number>()
  const sessionsByKind = new Map<string, string[]>()
  const degradedCountByKind = new Map<string, number>()

  for (const [sessionId, kinds] of input.degradedKindsBySession) {
    if (kinds.length === 0) continue
    for (const kind of kinds) {
      shares.set(kind, (shares.get(kind) ?? 0) + 1 / kinds.length)
      degradedCountByKind.set(kind, (degradedCountByKind.get(kind) ?? 0) + 1)
      const examples = sessionsByKind.get(kind) ?? []
      if (examples.length < CAUSE_EXAMPLE_SESSION_LIMIT) examples.push(sessionId)
      sessionsByKind.set(kind, examples)
    }
  }

  const rows = [...shares.entries()]
    .map(([kind, share]): DimensionCauseRow => {
      const degradedSessions = degradedCountByKind.get(kind) ?? 0
      // Sessions still degraded without this kind, which is what removing it alone would leave.
      const remaining = [...input.degradedKindsBySession.values()].filter(
        (kinds) => kinds.length > 0 && kinds.some((candidate) => candidate !== kind),
      ).length
      const remainingShare = remaining / degradation.analyzedSessionCount
      const fixGain = undegraded * (1 - loss * remainingShare) - input.observedScore

      return {
        scoreDimension: "outcome",
        causeId: `moment:${kind}`,
        label: kind,
        // Which sessions the rule fired on is read directly; that those sessions would otherwise
        // have scored clean is the model's claim, not an observation.
        evidence: "associated",
        attributedDeficit: (totalDeficit * share) / degradation.degradedSessionCount,
        fixGain,
        nativeEffect: { value: degradedSessions, unit: "sessions" },
        observationCount: degradedSessions,
        destination: "sessions",
        ...(sessionsByKind.get(kind)?.length ? { exampleSessionIds: sessionsByKind.get(kind) as string[] } : {}),
      }
    })
    .sort((left, right) => right.attributedDeficit - left.attributedDeficit)

  const explainedDeficit = rows.reduce((total, row) => total + row.attributedDeficit, 0)

  return {
    scoreDimension: "outcome",
    rows,
    // The closed form divides the deficit exactly, so nothing is left for a residual to absorb.
    residual: Math.max(0, totalDeficit - explainedDeficit),
    totalDeficit,
    explainedDeficit,
    method: "exact",
  }
}
