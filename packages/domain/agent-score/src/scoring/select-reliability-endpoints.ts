import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"

export const RELIABILITY_EXCLUSION_REASONS = ["unreadableTelemetry", "noApplicableReader"] as const
export type ReliabilityExclusionReason = (typeof RELIABILITY_EXCLUSION_REASONS)[number]

/** One session's operational endpoint, and whether it could be decided at all. */
export interface ReliabilitySessionEndpoint {
  readonly sessionId: string
  readonly terminalFailure: boolean
  readonly readable: boolean
  readonly unreadableReason?: ReliabilityExclusionReason
}

/**
 * Whether this finding is a session that could not produce a structurally usable completion.
 *
 * The list is `score.md`'s terminal-failure definition, and every member is a fact a reader
 * established rather than a judgement of quality. A recovered incident is deliberately absent: if
 * the session completed, the retry is recovery-family Cost evidence and marginal Speed time, and it
 * never lowers Reliability by a fraction. `terminal` is the readers' own statement that the session
 * made no successful progress afterwards, which is a stronger claim than one call having failed.
 */
const isTerminalFinding = (finding: AssessmentFinding): boolean => {
  switch (finding.kind) {
    case "noOutput":
      return finding.findingKind === "blank" || finding.findingKind === "confirmedUnusablePattern"
    case "outputDamage":
    case "finishFailure":
      return finding.generationPosition === "final"
    case "toolFailure":
    case "toolStructuralDefect":
    case "providerError":
      return finding.terminal
    // Everything else, signal occurrences included. A classified occurrence carries a dimension and
    // a role but no field asserting that the session ended without recovering, so admitting one
    // would turn "this session showed a failure mode" into "this session could not complete". The
    // union stays idempotent over signals: a signal can only name a session a deterministic reader
    // already placed in the set, which is also what keeps a split cluster from moving the rate.
    // `signals.md` requires occurrence metadata proving non-recovery before this can change, and
    // PR 5 froze the same boundary for confirmed harm.
    default:
      return false
  }
}

const RELIABILITY_DIMENSION = "reliability"

/**
 * Whether the session's telemetry could decide operational success at all.
 *
 * Every reader that informs Reliability has to have examined everything it found applicable. A
 * partially examined session is not a successful one: an unmapped finish reason or an unrecognised
 * provider error is precisely the evidence that would have said the session broke.
 */
const isFullyRead = (input: NormalizedSessionAssessmentInput): ReliabilitySessionEndpoint["unreadableReason"] => {
  const readers = input.readers.filter((reader) => reader.scoreDimensions.includes(RELIABILITY_DIMENSION))
  const applicable = readers.filter((reader) => reader.applicable)
  if (applicable.length === 0) return "noApplicableReader"
  return applicable.every((reader) => reader.readableCount >= reader.totalCount) ? undefined : "unreadableTelemetry"
}

/**
 * One session's Reliability endpoint.
 *
 * An observed terminal failure is readable whatever else was not. The asymmetry is deliberate and
 * load-bearing: a session that broke *and* carried an unmapped finish reason would otherwise leave
 * the denominator, and dropping failures preferentially is how a coverage rule quietly raises a
 * score. Coverage decides whether an absence of evidence counts as success, never whether an
 * observed failure counts as one.
 */
export const selectReliabilityEndpoint = (input: NormalizedSessionAssessmentInput): ReliabilitySessionEndpoint => {
  if (input.findings.some(isTerminalFinding)) {
    return { sessionId: input.sessionId, terminalFailure: true, readable: true }
  }

  const unreadableReason = isFullyRead(input)
  return {
    sessionId: input.sessionId,
    terminalFailure: false,
    readable: unreadableReason === undefined,
    ...(unreadableReason ? { unreadableReason } : {}),
  }
}

export const selectReliabilityEndpoints = (
  inputs: readonly NormalizedSessionAssessmentInput[],
): readonly ReliabilitySessionEndpoint[] => inputs.map(selectReliabilityEndpoint)
