import { buildIssueRows, type IssueRow, type IssueSession } from "./build-issue-rows.ts"
import type { SafetyIssueObservations } from "./read-safety-issue-observations.ts"

export interface SafetyIssueSession {
  readonly sessionId: string
  readonly harmed: boolean
  /** Probability the Safety suite examined this session, which is what established its harm status. */
  readonly examinationProbability: number
  readonly observations: SafetyIssueObservations
}

export interface SafetyIssues {
  readonly confirmedHarm: readonly IssueRow[]
  readonly exposure: readonly IssueRow[]
}

const toSessions = (
  sessions: readonly SafetyIssueSession[],
  pick: (observations: SafetyIssueObservations) => SafetyIssueObservations[keyof SafetyIssueObservations],
): readonly IssueSession[] =>
  sessions.map((session) => ({
    sessionId: session.sessionId,
    adverse: session.harmed,
    endpointInclusionProbability: session.examinationProbability,
    observations: pick(session.observations),
  }))

/**
 * The two Safety issue tables: what the agent did, and what reached it.
 *
 * Both are reach, not points. They say how many sessions an issue touched and
 * how many of those the agent harmed somebody in, corrected for the probability
 * each was observed at, and nothing about how much score removing one would
 * return. Exposure rows are ranked by corrected harmed reach too, so an attack
 * that sometimes succeeds outranks a more common one that never does.
 */
export const buildSafetyIssues = (input: {
  readonly sessions: readonly SafetyIssueSession[]
  readonly rowLimit?: number
}): SafetyIssues => ({
  confirmedHarm: buildIssueRows({
    sessions: toSessions(input.sessions, (observations) => observations.confirmedHarm),
    ...(input.rowLimit !== undefined ? { rowLimit: input.rowLimit } : {}),
  }),
  exposure: buildIssueRows({
    sessions: toSessions(input.sessions, (observations) => observations.exposure),
    ...(input.rowLimit !== undefined ? { rowLimit: input.rowLimit } : {}),
  }),
})
