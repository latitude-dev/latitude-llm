import { CAUSE_EXAMPLE_SESSION_LIMIT } from "../constants.ts"

/**
 * The population an issue's reader could have seen.
 *
 * `eligible` is every scored session. `analyzed` is the subset conversation analysis ran on, which
 * is smaller and selected deterministically on content rather than at random — so a count drawn
 * from it cannot be compared with an eligible-basis count without dividing by its own denominator.
 */
export type IssueBasis = "eligible" | "analyzed"

export interface IssueObservation {
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
   * endpoint. A signal discovered from the endpoint's own score is one
   * observation, not two independent ones, so their joint probability is the
   * endpoint's rather than a product.
   */
  readonly sharesEndpointSelection?: boolean
  /** Defaults to `eligible`; readers that only run on a subset name theirs. */
  readonly basis?: IssueBasis
}

export interface IssueSession {
  readonly sessionId: string
  readonly adverse: boolean
  /** Probability the session's endpoint was established. One when it was not sampled for. */
  readonly endpointInclusionProbability: number
  readonly observations: readonly IssueObservation[]
}

export interface IssueRow {
  readonly issueKey: string
  readonly label: string
  readonly signalIds: readonly string[]
  /** Selection-corrected sessions the issue reached. Absent when a contributing reader recorded no selection. */
  readonly estimatedReach?: number
  /** Selection-corrected sessions it reached whose endpoint went badly. */
  readonly estimatedAdverseReach?: number
  /** Raw counts, which are coverage context and never a ranking key. */
  readonly examinedSessions: number
  readonly examinedAdverseSessions: number
  /** False when a joint probability was unknown, so the row explains without claiming a position. */
  readonly ranked: boolean
  readonly basis: IssueBasis
  /** Sessions in this row's basis, so a rate can be read off the row rather than assumed. */
  readonly basisSessionCount: number
  /**
   * Sessions somebody can open to see the issue, capped at `CAUSE_EXAMPLE_SESSION_LIMIT`.
   *
   * Adverse sessions first: a row is read to find out what went wrong, and a session the issue
   * touched without the endpoint going badly answers that less well. Never a reach estimate — these
   * are raw examined sessions, and a row whose estimate corrects for sampling still lists only the
   * sessions actually read.
   */
  readonly exampleSessionIds: readonly string[]
}

interface IssueAccumulator {
  label: string
  basis: IssueBasis
  signalIds: Set<string>
  estimatedReach: number
  estimatedAdverseReach: number
  examinedSessions: number
  examinedAdverseSessions: number
  reachCorrected: boolean
  adverseReachCorrected: boolean
  adverseExamples: string[]
  otherExamples: string[]
}

/**
 * Probability of seeing the issue and the session's endpoint together.
 *
 * Independent draws multiply, which is what two different sampled readers are:
 * each runs its own deterministic sampling on the same session. An observation
 * that shares the endpoint's draw is perfectly correlated with it instead, so
 * multiplying would square a probability that was only rolled once.
 */
const jointProbability = (observation: IssueObservation, endpointInclusionProbability: number): number | undefined => {
  if (observation.observationProbability === undefined) return undefined
  if (observation.sharesEndpointSelection === true) return endpointInclusionProbability
  return observation.observationProbability * endpointInclusionProbability
}

const isUsable = (probability: number | undefined): probability is number =>
  probability !== undefined && Number.isFinite(probability) && probability > 0

/** Keeps the two samples apart so the row can lead with the sessions that went badly. */
const recordExample = (issue: IssueAccumulator, sessionId: string, adverse: boolean): void => {
  const examples = adverse ? issue.adverseExamples : issue.otherExamples
  if (examples.length < CAUSE_EXAMPLE_SESSION_LIMIT) examples.push(sessionId)
}

/**
 * The issues that explain where a dimension's adverse sessions concentrate.
 *
 * Shared by Outcome and Safety: one counts task failures against the verdict
 * that established them, the other confirmed harm against the suite that
 * examined the session, and only what the adverse axis means differs.
 *
 * Counts are reach, not points. They say how many sessions an issue touched and
 * how many of those went badly, corrected for the probability each was observed at,
 * and nothing about how much score removing it would return. One session
 * contributes to an issue once however many detectors saw it, so a split signal
 * cluster or a session with several matching moments cannot inflate a row.
 */
export const buildIssueRows = (input: {
  readonly sessions: readonly IssueSession[]
  /** Sessions each basis contains, so a row from a narrower reader is ranked on its own denominator. */
  readonly basisSessionCounts?: Readonly<Partial<Record<IssueBasis, number>>>
  readonly rowLimit?: number
}): readonly IssueRow[] => {
  const issues = new Map<string, IssueAccumulator>()

  for (const session of input.sessions) {
    const seen = new Set<string>()
    for (const observation of session.observations) {
      // One session counts once per issue, whatever saw it.
      if (seen.has(observation.issueKey)) continue
      seen.add(observation.issueKey)

      const issue = issues.get(observation.issueKey) ?? {
        label: observation.label,
        basis: observation.basis ?? "eligible",
        signalIds: new Set<string>(),
        estimatedReach: 0,
        estimatedAdverseReach: 0,
        examinedSessions: 0,
        examinedAdverseSessions: 0,
        reachCorrected: true,
        adverseReachCorrected: true,
        adverseExamples: [],
        otherExamples: [],
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

      if (session.adverse) {
        issue.examinedAdverseSessions += 1
        const joint = jointProbability(observation, session.endpointInclusionProbability)
        if (isUsable(joint)) issue.estimatedAdverseReach += 1 / joint
        else issue.adverseReachCorrected = false
      }
      recordExample(issue, session.sessionId, session.adverse)

      issues.set(observation.issueKey, issue)
    }
  }

  const basisCountOf = (basis: IssueBasis): number =>
    input.basisSessionCounts?.[basis] ?? (basis === "eligible" ? input.sessions.length : 0)

  const rows = [...issues.entries()].map(([issueKey, issue]): IssueRow => {
    const ranked = issue.reachCorrected && issue.adverseReachCorrected
    return {
      issueKey,
      label: issue.label,
      basis: issue.basis,
      basisSessionCount: basisCountOf(issue.basis),
      signalIds: [...issue.signalIds],
      ...(issue.reachCorrected ? { estimatedReach: issue.estimatedReach } : {}),
      ...(issue.adverseReachCorrected ? { estimatedAdverseReach: issue.estimatedAdverseReach } : {}),
      examinedSessions: issue.examinedSessions,
      examinedAdverseSessions: issue.examinedAdverseSessions,
      ranked,
      exampleSessionIds: [...issue.adverseExamples, ...issue.otherExamples].slice(0, CAUSE_EXAMPLE_SESSION_LIMIT),
    }
  })

  // Ranked rows lead, ordered by corrected adverse reach. An unranked row still
  // appears, because the issue is real even when its share of the failures
  // cannot be estimated, but it cannot claim a position it did not earn.
  // Rate within basis, not raw reach. A moment row counts sessions out of the ones analysis ran on
  // and a deterministic row counts them out of every eligible session, so comparing the two counts
  // directly would rank the narrower reader last however concentrated its failures are.
  const adverseRateOf = (row: IssueRow): number => {
    const basisCount = row.basisSessionCount
    if (basisCount <= 0) return 0
    return (row.estimatedAdverseReach ?? row.examinedAdverseSessions) / basisCount
  }

  const sorted = rows.sort((left, right) => {
    if (left.ranked !== right.ranked) return left.ranked ? -1 : 1
    if (left.ranked) return adverseRateOf(right) - adverseRateOf(left)
    // An unranked row may have no corrected reach either, so the raw share is
    // the only figure both sides are guaranteed to have.
    return adverseRateOf(right) - adverseRateOf(left)
  })
  return input.rowLimit === undefined ? sorted : sorted.slice(0, input.rowLimit)
}
