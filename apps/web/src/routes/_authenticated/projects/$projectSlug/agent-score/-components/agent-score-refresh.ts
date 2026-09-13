import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"

const REFRESH_POLL_INTERVAL_MS = 2_000
const REFRESH_POLL_ATTEMPTS = 120

const pause = (duration: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, duration))

export const agentScoreRefreshMarker = ({
  snapshot,
  explanation,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly explanation: AgentScoreExplanationRecord["explanation"]
}): string => `${snapshot?.date ?? "none"}:${snapshot?.score ?? "none"}:${explanation?.computedAt ?? "none"}`

export const waitForAgentScoreRefresh = async ({
  previousMarker,
  refetch,
  attempts = REFRESH_POLL_ATTEMPTS,
  intervalMs = REFRESH_POLL_INTERVAL_MS,
  wait = pause,
}: {
  readonly previousMarker: string
  readonly refetch: () => Promise<string>
  readonly attempts?: number
  readonly intervalMs?: number
  readonly wait?: (duration: number) => Promise<void>
}): Promise<boolean> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await refetch()) !== previousMarker) return true
    if (attempt + 1 < attempts) await wait(intervalMs)
  }
  return false
}
