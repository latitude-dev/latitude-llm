import {
  AGENT_SCORE_REFRESH_POLL_BACKOFF_MS,
  AGENT_SCORE_REFRESH_POLL_INTERVAL_MS,
  AGENT_SCORE_REFRESH_POLL_SETTLE_MS,
  AGENT_SCORE_REFRESH_POLL_WINDOW_MS,
} from "../../../../../../domains/agent-score/agent-score.constants.ts"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"

const SETTLE_ATTEMPTS = Math.ceil(AGENT_SCORE_REFRESH_POLL_SETTLE_MS / AGENT_SCORE_REFRESH_POLL_INTERVAL_MS)

/** Fast while a short run can still land, then slow enough that covering the whole window is cheap. */
export const agentScoreRefreshPollDelayMs = (attempt: number): number =>
  attempt < SETTLE_ATTEMPTS ? AGENT_SCORE_REFRESH_POLL_INTERVAL_MS : AGENT_SCORE_REFRESH_POLL_BACKOFF_MS

const REFRESH_POLL_ATTEMPTS =
  SETTLE_ATTEMPTS +
  Math.ceil(
    (AGENT_SCORE_REFRESH_POLL_WINDOW_MS - AGENT_SCORE_REFRESH_POLL_SETTLE_MS) / AGENT_SCORE_REFRESH_POLL_BACKOFF_MS,
  )

const pause = (duration: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, duration))

type AgentScoreSnapshotMarkerRecord = Pick<AgentScoreRecord, "date" | "score" | "createdAt">

export const agentScoreSnapshotMarker = (snapshot: AgentScoreSnapshotMarkerRecord | null): string =>
  [snapshot?.date ?? "none", snapshot?.score ?? "none", snapshot?.createdAt ?? "none"].join(":")

export const agentScoreRefreshMarker = ({
  snapshot,
  explanation,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly explanation: AgentScoreExplanationRecord["explanation"]
}): string => [agentScoreSnapshotMarker(snapshot), explanation?.computedAt ?? "none"].join(":")

export const isCurrentAgentScoreSnapshot = (snapshot: Pick<AgentScoreRecord, "date"> | null, date: string): boolean =>
  snapshot?.date === date

export const isStaleAgentScoreSnapshot = (snapshot: Pick<AgentScoreRecord, "date"> | null, date: string): boolean =>
  snapshot !== null && snapshot.date !== date

export const agentVitalityIsLoading = (snapshot: Pick<AgentScoreRecord, "date"> | null, isLoading: boolean): boolean =>
  snapshot === null && isLoading

export const agentScoreRefreshCompleted = ({
  previousSnapshotMarker,
  previousExplanationTime,
  date,
  snapshot,
  explanation,
}: {
  readonly previousSnapshotMarker: string
  readonly previousExplanationTime: string | undefined
  readonly date: string
  readonly snapshot: AgentScoreSnapshotMarkerRecord | null
  readonly explanation: AgentScoreExplanationRecord["explanation"]
}): boolean => {
  const snapshotIsCurrent = isCurrentAgentScoreSnapshot(snapshot, date)
  const snapshotChanged = snapshotIsCurrent && agentScoreSnapshotMarker(snapshot) !== previousSnapshotMarker
  const explanationChanged = explanation?.computedAt !== previousExplanationTime
  const explanationIsCurrent = explanation?.date === date
  if (snapshotChanged) return true
  if (!explanation || !explanationChanged || !explanationIsCurrent) return false
  return snapshotIsCurrent || explanation.publication.status === "withheld"
}

export const agentScoreExplanationForSnapshot = ({
  explanation,
  date,
  snapshot,
}: {
  readonly explanation: AgentScoreExplanationRecord["explanation"]
  readonly date: string
  readonly snapshot: Pick<AgentScoreRecord, "scoringVersion"> | null
}): AgentScoreExplanationRecord["explanation"] => {
  if (explanation?.date !== date) return null
  if (snapshot && explanation.scoringVersion !== snapshot.scoringVersion) return null
  return explanation
}

export const agentScoreSnapshotEvidenceCompleted = ({
  needsSnapshotEvidence,
  previousSnapshotExplanationTime,
  snapshotExplanation,
}: {
  readonly needsSnapshotEvidence: boolean
  readonly previousSnapshotExplanationTime: string | undefined
  readonly snapshotExplanation: AgentScoreExplanationRecord["explanation"]
}): boolean =>
  !needsSnapshotEvidence ||
  (snapshotExplanation !== null && snapshotExplanation.computedAt !== previousSnapshotExplanationTime)

export const waitForAgentScoreRefresh = async ({
  previousMarker,
  refetch,
  attempts = REFRESH_POLL_ATTEMPTS,
  delayMs = agentScoreRefreshPollDelayMs,
  wait = pause,
}: {
  readonly previousMarker: string
  readonly refetch: () => Promise<string>
  readonly attempts?: number
  readonly delayMs?: (attempt: number) => number
  readonly wait?: (duration: number) => Promise<void>
}): Promise<boolean> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await refetch()) !== previousMarker) return true
    if (attempt + 1 < attempts) await wait(delayMs(attempt))
  }
  return false
}
