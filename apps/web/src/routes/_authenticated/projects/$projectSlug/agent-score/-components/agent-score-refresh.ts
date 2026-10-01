import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"

export const isCurrentAgentScoreSnapshot = (snapshot: Pick<AgentScoreRecord, "date"> | null, date: string): boolean =>
  snapshot?.date === date

export const agentVitalityIsLoading = (snapshot: Pick<AgentScoreRecord, "date"> | null, isLoading: boolean): boolean =>
  snapshot === null && isLoading

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
