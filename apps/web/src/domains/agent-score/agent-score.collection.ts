import { skipToken, useQuery } from "@tanstack/react-query"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  AGENT_SCORE_COMPUTATION_ACTIVE_POLL_INTERVAL_MS,
  AGENT_SCORE_COMPUTATION_IDLE_POLL_INTERVAL_MS,
} from "./agent-score.constants.ts"
import {
  getProjectAgentScore,
  getProjectAgentScoreComputation,
  getProjectAgentScoreExplanation,
  getProjectAgentScoreHistory,
} from "./agent-score.functions.ts"

const SCORE_STALE_TIME = 5 * 60_000

const keepSameDateData =
  <T>(date: string | undefined) =>
  (previousData: T | undefined, previousQuery: { readonly queryKey: readonly unknown[] } | undefined): T | undefined =>
    previousQuery?.queryKey[previousQuery.queryKey.length - 2] === date ? previousData : undefined

export function useProjectAgentScoreComputation(projectId: string, date?: string) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score-computation", projectId, date],
    queryFn: () => getProjectAgentScoreComputation({ data: { ...projectScopeData(scope), projectId, date } }),
    enabled: projectId.length > 0,
    refetchInterval: (query) =>
      query.state.data?.status === "computing"
        ? AGENT_SCORE_COMPUTATION_ACTIVE_POLL_INTERVAL_MS
        : AGENT_SCORE_COMPUTATION_IDLE_POLL_INTERVAL_MS,
  })
}

export function useProjectAgentScore(projectId: string, date: string | undefined, computationMarker: string) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score", projectId, date, computationMarker],
    queryFn: () => getProjectAgentScore({ data: { ...projectScopeData(scope), projectId, date } }),
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0,
    placeholderData: keepSameDateData(date),
  })
}

export function useProjectAgentScoreHistory(projectId: string, date: string | undefined, computationMarker: string) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score-history", projectId, date, computationMarker],
    queryFn: date
      ? () => getProjectAgentScoreHistory({ data: { ...projectScopeData(scope), projectId, date } })
      : skipToken,
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0 && date !== undefined,
    placeholderData: keepSameDateData(date),
  })
}

export function useProjectAgentScoreExplanation(
  projectId: string,
  date: string | undefined,
  computationMarker: string,
) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score-explanation", projectId, date, computationMarker],
    queryFn: date
      ? () => getProjectAgentScoreExplanation({ data: { ...projectScopeData(scope), projectId, date } })
      : skipToken,
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0 && date !== undefined,
    placeholderData: keepSameDateData(date),
  })
}
