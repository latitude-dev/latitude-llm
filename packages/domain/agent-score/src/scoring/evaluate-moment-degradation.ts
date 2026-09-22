import type { MomentDegradationRule } from "../entities/agent-score-artifact.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"

/** One session's degradation verdict, and the kinds that established it. */
interface MomentDegradation {
  readonly degraded: boolean
  /**
   * The kinds that met their rule, so a cause row can name what degraded the session.
   *
   * Sorted, because the set identifies the session's degradation for grouping and a stable order
   * keeps a cause key from depending on label read order.
   */
  readonly kinds: readonly string[]
}

const NOT_DEGRADED: MomentDegradation = { degraded: false, kinds: [] }

/**
 * Whether conversation moments mark this session's outcome as degraded.
 *
 * Degrading only, never disqualifying. The classifier's storage floors are 0.65–0.8, which is too
 * thin to assert that a task was not accomplished — the claim that would put a session in the
 * census at weight one. A degraded session still delivered what the user asked for.
 *
 * Only meaningful on a session conversation analysis actually read. On a skipped or failed one the
 * absence of moments says nothing, so the caller must not read `degraded: false` as evidence of a
 * clean session; `momentsAnalyzed` is what separates the two.
 *
 * Counting is per label rather than per moment: a rule asking for three corrections means three
 * corrections happened, however many semantic moments they were split across.
 */
export const evaluateMomentDegradation = ({
  session,
  rules,
}: {
  readonly session: Pick<NormalizedSessionAssessmentInput, "findings" | "momentsAnalyzed">
  readonly rules: readonly MomentDegradationRule[]
}): MomentDegradation => {
  if (!session.momentsAnalyzed || rules.length === 0) return NOT_DEGRADED

  const countsByKind = new Map<string, number>()
  for (const finding of session.findings) {
    if (finding.kind !== "moment") continue
    for (const label of finding.momentLabels) {
      const rule = rules.find((candidate) => candidate.kind === label.kind)
      if (!rule || label.confidence < rule.minConfidence) continue
      countsByKind.set(label.kind, (countsByKind.get(label.kind) ?? 0) + 1)
    }
  }

  const kinds = rules
    .filter((rule) => (countsByKind.get(rule.kind) ?? 0) >= rule.minOccurrences)
    .map((rule) => rule.kind)
    .sort()

  return kinds.length === 0 ? NOT_DEGRADED : { degraded: true, kinds }
}
