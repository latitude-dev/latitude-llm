import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { resolveSessionAssessmentItems } from "../resolver/resolve-assessment-findings.ts"
import type { IssueObservation } from "./build-issue-rows.ts"
import { buildIssueRows, ISSUE_ROW_LIMIT, type IssueRow, type IssueSession } from "./build-issue-rows.ts"
import { buildSafetyIssues, type SafetyIssues } from "./build-safety-issues.ts"
import type { ProjectOutcomeEstimate } from "./estimate-outcome.ts"
import type { ProjectSafetyEstimate } from "./estimate-safety.ts"
import { readOutcomeIssueObservations } from "./read-outcome-issue-observations.ts"
import { readSafetyIssueObservations, type SafetyIssueObservations } from "./read-safety-issue-observations.ts"

const TASK_OUTCOME_SLUG = "task-failure"
const SAFETY_SUITE_SLUGS: readonly string[] = ["jailbreaking", "pii-leakage"]

/** One session's issue observations, kept rather than its whole assessment. */
export interface SessionIssueEvidence {
  readonly sessionId: string
  readonly outcome: readonly IssueObservation[]
  readonly safety: SafetyIssueObservations
}

const decisionProbability = (
  session: NormalizedSessionAssessmentInput,
  slugs: readonly string[],
): number | undefined => {
  const probabilities = session.screeningDecisions
    .filter((decision) => slugs.includes(decision.flaggerSlug))
    .map((decision) => decision.inclusionProbability)
    .filter((probability): probability is number => probability !== undefined && probability > 0)
  return probabilities.length === 0 ? undefined : Math.min(...probabilities)
}

/**
 * The issue observations one session contributes to both sampled dimensions.
 *
 * Read in the window pass, beside everything else the session is read for, because the alternative
 * is a second pass over the same telemetry to answer a question the first pass already had in hand.
 * Only the observations survive the batch; the items they came from do not.
 */
export const readSessionIssueEvidence = (session: NormalizedSessionAssessmentInput): SessionIssueEvidence => {
  const items = resolveSessionAssessmentItems(session.findings)
  const eligibleSignalIds = new Set(session.scoringEligibleSignalIds)
  // A signal discovered from the verdict score rode the verdict's own draw. Without this the two
  // probabilities multiply and the issue's reach comes out an order of magnitude too large.
  const verdictScoreIds = session.findings.flatMap((finding) =>
    finding.kind === "taskOutcome" ? [...finding.scoreIds] : [],
  )
  const outcomeProbability = decisionProbability(session, [TASK_OUTCOME_SLUG])
  const safetyProbability = decisionProbability(session, SAFETY_SUITE_SLUGS)

  return {
    sessionId: session.sessionId,
    outcome: readOutcomeIssueObservations({
      items,
      eligibleSignalIds,
      verdictScoreIds,
      ...(outcomeProbability !== undefined ? { observationProbability: outcomeProbability } : {}),
    }),
    safety: readSafetyIssueObservations({
      items,
      eligibleSignalIds,
      ...(safetyProbability !== undefined ? { observationProbability: safetyProbability } : {}),
    }),
  }
}

export interface WindowIssues {
  readonly outcome: readonly IssueRow[]
  readonly safety: SafetyIssues
}

export const EMPTY_WINDOW_ISSUES: WindowIssues = { outcome: [], safety: { confirmedHarm: [], exposure: [] } }

/**
 * The issue tables for the two sampled dimensions.
 *
 * These are the smaller contract on purpose. Outcome and Safety come from a holistic verdict and a
 * confirmed-harm union, not from adding up defects, so an issue here reports where failures
 * concentrate and never claims a share of the score or a number of points removing it would return.
 *
 * Both tables are joined to the sessions their estimator actually used. A row built over sessions
 * the estimator excluded would describe a different denominator than the score printed above it,
 * which is the specific way a plausible-looking issue list can contradict the number it explains.
 */
export const buildWindowIssues = ({
  evidence,
  outcome,
  safety,
  rowLimit = ISSUE_ROW_LIMIT,
}: {
  readonly evidence: readonly SessionIssueEvidence[]
  readonly outcome: ProjectOutcomeEstimate
  readonly safety: ProjectSafetyEstimate
  readonly rowLimit?: number
}): WindowIssues => {
  const byId = new Map(evidence.map((session) => [session.sessionId, session]))

  const outcomeSessions: IssueSession[] = [
    ...outcome.judgedSessions.map((verdict) => ({
      sessionId: verdict.sessionId,
      adverse: !verdict.succeeded,
      endpointInclusionProbability: verdict.inclusionProbability,
      observations: byId.get(verdict.sessionId)?.outcome ?? [],
    })),
    // The census is certain failure, so its sessions weigh one rather than standing for a sample.
    ...outcome.deterministicFailureSessionIds.map((sessionId) => ({
      sessionId,
      adverse: true,
      endpointInclusionProbability: 1,
      observations: byId.get(sessionId)?.outcome ?? [],
    })),
  ]

  const safetySessions = safety.examinedSessions.map((examined) => ({
    sessionId: examined.sessionId,
    harmed: examined.harmed,
    examinationProbability: examined.examinationProbability,
    observations: byId.get(examined.sessionId)?.safety ?? { confirmedHarm: [], exposure: [] },
  }))

  return {
    outcome: buildIssueRows({ sessions: outcomeSessions, rowLimit }),
    safety: buildSafetyIssues({ sessions: safetySessions, rowLimit }),
  }
}
