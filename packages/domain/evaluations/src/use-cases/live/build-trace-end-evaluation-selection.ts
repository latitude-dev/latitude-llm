import type { FilterSet } from "@domain/shared"
import type { TraceEndSelectionSpec } from "@domain/spans"

import type { Evaluation } from "../../entities/evaluation.ts"
import { getLiveEvaluationEligibility } from "../../helpers.ts"

export const buildLiveTraceEndEvaluationSelectionKey = (evaluationId: string) => `live-evaluation:${evaluationId}`

/**
 * The live filter pre-gate reads the owning signal's `filters` (canonical), not the evaluation's
 * `trigger.filter` (retired). `filtersBySignalId` carries each active evaluation's signal filters;
 * a missing entry or null means no pre-gate (match all traces).
 */
export const buildTraceEndEvaluationSelectionInputs = (
  activeEvaluations: readonly Evaluation[],
  filtersBySignalId: ReadonlyMap<string, FilterSet | null>,
) => {
  const evaluationEligibility = activeEvaluations.map((evaluation) => ({
    evaluation,
    eligibility: getLiveEvaluationEligibility(evaluation),
  }))
  const skippedIneligibleCount = evaluationEligibility.reduce(
    (count, item) => (item.eligibility.eligible ? count : count + 1),
    0,
  )
  const eligibleEvaluations = evaluationEligibility.flatMap((item) =>
    item.eligibility.eligible ? [item.evaluation] : [],
  )

  const evaluationByKey = new Map<string, Evaluation>()
  const items = Object.create(null) as Record<string, TraceEndSelectionSpec>

  for (const evaluation of eligibleEvaluations) {
    const key = buildLiveTraceEndEvaluationSelectionKey(evaluation.id)
    evaluationByKey.set(key, evaluation)
    const filter = filtersBySignalId.get(evaluation.signalId) ?? null
    items[key] = {
      sampling: evaluation.trigger.sampling,
      ...(filter ? { filter } : {}),
      sampleKey: evaluation.id,
    }
  }

  return {
    skippedIneligibleCount,
    evaluationByKey,
    items,
  }
}
