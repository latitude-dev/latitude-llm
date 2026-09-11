/** How many issue rows the page can absorb before the tail stops explaining anything. */
export const OUTCOME_ISSUE_ROW_LIMIT = 20

export interface OutcomeIssueObservation {
  /** Identity of the issue, already collapsed: a signal and the score it was discovered from share one. */
  readonly issueKey: string
  readonly label: string
  readonly signalId?: string
  /**
   * Probability this issue could have been seen on this session. One for a
   * reader that runs on everything; absent when the reader's selection is not
   * recorded, which leaves the row unranked rather than guessed.
   */
  readonly observationProbability?: number
  /**
   * Whether the issue was observed by the same draw that produced the session's
   * outcome verdict. A signal discovered from the verdict score is one
   * observation, not two independent ones, so their joint probability is the
   * verdict's rather than a product.
   */
  readonly sharesOutcomeSelection?: boolean
}

export interface OutcomeIssueSession {
  readonly sessionId: string
  readonly failed: boolean
  /** Probability the session's outcome was established. One for the deterministic census. */
  readonly outcomeInclusionProbability: number
  readonly observations: readonly OutcomeIssueObservation[]
}

export interface OutcomeIssueRow {
  readonly issueKey: string
  readonly label: string
  readonly signalIds: readonly string[]
  /** Selection-corrected sessions the issue reached. Absent when a contributing reader recorded no selection. */
  readonly estimatedReach?: number
  /** Selection-corrected sessions it reached that also failed. */
  readonly estimatedFailedReach?: number
  /** Raw counts, which are coverage context and never a ranking key. */
  readonly examinedSessions: number
  readonly examinedFailedSessions: number
  /** False when a joint probability was unknown, so the row explains without claiming a position. */
  readonly ranked: boolean
}

interface IssueAccumulator {
  label: string
  signalIds: Set<string>
  estimatedReach: number
  estimatedFailedReach: number
  examinedSessions: number
  examinedFailedSessions: number
  reachCorrected: boolean
  failedReachCorrected: boolean
}

/**
 * Probability of seeing the issue and the session's outcome together.
 *
 * Independent draws multiply, which is what two different sampled readers are:
 * each runs its own deterministic sampling on the same session. An observation
 * that shares the outcome's draw is perfectly correlated with it instead, so
 * multiplying would square a probability that was only rolled once.
 */
const jointProbability = (
  observation: OutcomeIssueObservation,
  outcomeInclusionProbability: number,
): number | undefined => {
  if (observation.observationProbability === undefined) return undefined
  if (observation.sharesOutcomeSelection === true) return outcomeInclusionProbability
  return observation.observationProbability * outcomeInclusionProbability
}

const isUsable = (probability: number | undefined): probability is number =>
  probability !== undefined && Number.isFinite(probability) && probability > 0

/**
 * The issues that explain where Outcome's failures concentrate.
 *
 * Counts are reach, not points. They say how many sessions an issue touched and
 * how many of those failed, corrected for the probability each was observed at,
 * and nothing about how much score removing it would return. One session
 * contributes to an issue once however many detectors saw it, so a split signal
 * cluster or a session with several matching moments cannot inflate a row.
 */
export const buildOutcomeIssues = (input: {
  readonly sessions: readonly OutcomeIssueSession[]
  readonly rowLimit?: number
}): readonly OutcomeIssueRow[] => {
  const issues = new Map<string, IssueAccumulator>()

  for (const session of input.sessions) {
    const seen = new Set<string>()
    for (const observation of session.observations) {
      // One session counts once per issue, whatever saw it.
      if (seen.has(observation.issueKey)) continue
      seen.add(observation.issueKey)

      const issue = issues.get(observation.issueKey) ?? {
        label: observation.label,
        signalIds: new Set<string>(),
        estimatedReach: 0,
        estimatedFailedReach: 0,
        examinedSessions: 0,
        examinedFailedSessions: 0,
        reachCorrected: true,
        failedReachCorrected: true,
      }

      if (observation.signalId) issue.signalIds.add(observation.signalId)
      issue.examinedSessions += 1
      // An uncorrected raw count is not a reach estimate. A reader sampling at
      // 10% that did not record its selection would report a tenth of the
      // sessions it stands for, so the row reports no estimate at all and
      // leans on `examinedSessions`, which is honestly raw.
      if (isUsable(observation.observationProbability)) {
        issue.estimatedReach += 1 / observation.observationProbability
      } else {
        issue.reachCorrected = false
      }

      if (session.failed) {
        issue.examinedFailedSessions += 1
        const joint = jointProbability(observation, session.outcomeInclusionProbability)
        if (isUsable(joint)) issue.estimatedFailedReach += 1 / joint
        else issue.failedReachCorrected = false
      }

      issues.set(observation.issueKey, issue)
    }
  }

  const rows = [...issues.entries()].map(([issueKey, issue]): OutcomeIssueRow => {
    const ranked = issue.reachCorrected && issue.failedReachCorrected
    return {
      issueKey,
      label: issue.label,
      signalIds: [...issue.signalIds],
      ...(issue.reachCorrected ? { estimatedReach: issue.estimatedReach } : {}),
      ...(issue.failedReachCorrected ? { estimatedFailedReach: issue.estimatedFailedReach } : {}),
      examinedSessions: issue.examinedSessions,
      examinedFailedSessions: issue.examinedFailedSessions,
      ranked,
    }
  })

  // Ranked rows lead, ordered by corrected failed reach. An unranked row still
  // appears, because the issue is real even when its share of the failures
  // cannot be estimated, but it cannot claim a position it did not earn.
  return rows
    .sort((left, right) => {
      if (left.ranked !== right.ranked) return left.ranked ? -1 : 1
      if (left.ranked) return (right.estimatedFailedReach ?? 0) - (left.estimatedFailedReach ?? 0)
      // An unranked row may have no corrected reach either, so the raw count is
      // the only figure both sides are guaranteed to have.
      return right.examinedSessions - left.examinedSessions
    })
    .slice(0, input.rowLimit ?? OUTCOME_ISSUE_ROW_LIMIT)
}
