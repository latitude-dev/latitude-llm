import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"

/**
 * Whether a deterministic reader proved this session could not have succeeded.
 *
 * Only hard endpoints qualify. No delivered output at all, and a final
 * generation that ended on an unreliable finish reason, are both facts about
 * the session rather than judgements of it, which is what lets them count with
 * certainty instead of being sampled. `output-schema-validation` pairs with the
 * length-related finish reasons upstream, so a configured short stop that still
 * returned a complete value never reaches here.
 *
 * An unconfirmed repeated-character pattern is deliberately not an endpoint: a
 * compact answer like `111` can be exactly what was asked for.
 *
 * The gate is task applicability. A session with no user-authored request has
 * nothing to have failed, so it is not applicable to Outcome rather than a
 * failure of it.
 */
export const hasDeterministicOutcomeFailure = (input: NormalizedSessionAssessmentInput): boolean => {
  if (!input.hasReadableUserTask) return false

  return input.findings.some((finding) => {
    if (finding.kind === "noOutput") {
      return finding.findingKind === "blank" || finding.findingKind === "confirmedUnusablePattern"
    }
    return finding.kind === "finishFailure" && finding.generationPosition === "final"
  })
}

/** The session ids that form Outcome's deterministic census stratum. */
export const selectDeterministicOutcomeFailures = (
  inputs: readonly NormalizedSessionAssessmentInput[],
): readonly string[] => inputs.filter(hasDeterministicOutcomeFailure).map((input) => input.sessionId)
