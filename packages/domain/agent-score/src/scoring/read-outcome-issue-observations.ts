import type { ResolvedAssessmentItem } from "../resolver/resolve-assessment-findings.ts"
import type { IssueObservation } from "./build-issue-rows.ts"

/** The verdict is Outcome's endpoint, so it explains nothing; it is the thing the issues explain. */
const TASK_OUTCOME_METRIC_ID = "sessions.task_success"

const explainsOutcomeFailure = (item: ResolvedAssessmentItem["item"]): boolean =>
  item.metricId !== TASK_OUTCOME_METRIC_ID &&
  item.effects.some((effect) => effect.scoreDimension === "outcome" && effect.direction === "negative")

/**
 * The issue observations one session contributes.
 *
 * `groupKey` is the identity, which already collapses a signal and the score it
 * was discovered from into one item, so a cluster that split across detectors
 * cannot appear twice on the same session.
 *
 * A signal only counts when it is eligible for scoring: promoted, system-owned,
 * and neither ignored nor deleted. Workflow state does not describe behaviour,
 * so a triage decision must not move the score's explanation.
 */
export const readOutcomeIssueObservations = (input: {
  readonly items: readonly ResolvedAssessmentItem[]
  /** Signals whose occurrences may inform a score, from `scoringEligibleSignalIds`. */
  readonly eligibleSignalIds: ReadonlySet<string>
  readonly verdictScoreIds?: readonly string[]
  /**
   * Whether conversation analysis ran on this session.
   *
   * A moment is certain on a session analysis examined and unobservable on one it skipped, so this
   * decides both the basis the row is read against and whether it can be corrected at all. It lives
   * here rather than on the finding because it is a fact about the session, and a finding built
   * outside the moment reader would otherwise silently lose it.
   */
  readonly momentsAnalyzed?: boolean
}): readonly IssueObservation[] => {
  const { eligibleSignalIds } = input
  const verdictScoreIds = new Set(input.verdictScoreIds ?? [])

  return input.items
    .filter(({ item }) => explainsOutcomeFailure(item))
    .flatMap((resolved): IssueObservation[] => {
      const { item } = resolved
      const signalId = item.signalIds.find((id) => eligibleSignalIds.has(id))
      if (item.signalIds.length > 0 && signalId === undefined) return []

      return [
        {
          issueKey: item.groupKey,
          label: item.label,
          ...(signalId ? { signalId } : {}),
          // Conversation analysis does not run on every session, so a moment row's count is a share
          // of the analyzed sessions and has to be ranked and read against that denominator. Certain
          // within that basis, and uncorrectable outside it.
          ...(item.source === "moment"
            ? {
                basis: "analyzed" as const,
                ...(input.momentsAnalyzed ? { observationProbability: 1 } : {}),
              }
            : resolved.observationProbability !== undefined
              ? { observationProbability: resolved.observationProbability }
              : {}),
          // A signal built from the verdict score rode the same selection draw,
          // so its joint probability with the outcome is that draw, not a product.
          ...(item.scoreIds.some((scoreId) => verdictScoreIds.has(scoreId)) ? { sharesEndpointSelection: true } : {}),
        },
      ]
    })
}
