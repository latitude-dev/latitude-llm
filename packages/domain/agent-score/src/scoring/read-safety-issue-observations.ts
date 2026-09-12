import { isSignalEligibleForScoring, type SignalWithLifecycle } from "@domain/signals"
import type { SessionAssessmentItem } from "../entities/session-assessment.ts"
import type { IssueObservation } from "./build-issue-rows.ts"

export interface SafetyIssueObservations {
  /** Issues whose evidence is the agent causing harm. */
  readonly confirmedHarm: readonly IssueObservation[]
  /** Issues whose evidence is only what reached the agent, which the page lists beside the score. */
  readonly exposure: readonly IssueObservation[]
}

const safetyStatuses = (item: SessionAssessmentItem): readonly string[] =>
  item.effects.flatMap((effect) => (effect.impact?.kind === "safety" ? [effect.impact.status] : []))

/**
 * The Safety issue observations one session contributes.
 *
 * `groupKey` is the identity, which already collapses a signal and the score it
 * was discovered from into one item, so a cluster that split across detectors
 * cannot appear twice on the same session.
 *
 * A session that was harmed lands in the harm list only, which is what makes the
 * exposure list the "exposure only" one the page shows: the attacks that
 * succeeded are already counted beside the score rather than twice.
 *
 * A signal only counts when it is eligible for scoring: promoted, system-owned,
 * and neither ignored nor deleted. Workflow state does not describe behaviour,
 * so a triage decision must not move the score's explanation.
 */
export const readSafetyIssueObservations = (input: {
  readonly items: readonly SessionAssessmentItem[]
  readonly signals: readonly SignalWithLifecycle[]
  /** The probability the Safety suite examined this session, which every one of its findings rode. */
  readonly observationProbability?: number
}): SafetyIssueObservations => {
  const eligibleSignalIds = new Set(
    input.signals.filter(isSignalEligibleForScoring).map((signal) => signal.id as string),
  )
  const confirmedHarm: IssueObservation[] = []
  const exposure: IssueObservation[] = []

  for (const item of input.items) {
    const statuses = safetyStatuses(item)
    if (statuses.length === 0) continue

    const signalId = item.signalIds.find((id) => eligibleSignalIds.has(id))
    if (item.signalIds.length > 0 && signalId === undefined) continue

    const observation: IssueObservation = {
      issueKey: item.groupKey,
      label: item.label,
      ...(signalId ? { signalId } : {}),
      ...(input.observationProbability !== undefined ? { observationProbability: input.observationProbability } : {}),
      // The finding and the session's harm status come from the same suite
      // draw, so their joint probability is that draw rather than a product.
      sharesEndpointSelection: true,
    }

    if (statuses.includes("confirmedHarm")) confirmedHarm.push(observation)
    else if (statuses.includes("exposure")) exposure.push(observation)
  }

  return { confirmedHarm, exposure }
}
