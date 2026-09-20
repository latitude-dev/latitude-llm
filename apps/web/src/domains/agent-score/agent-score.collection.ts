import { skipToken, useQuery } from "@tanstack/react-query"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  getProjectAgentScore,
  getProjectAgentScoreExplanation,
  getProjectAgentScoreHistory,
} from "./agent-score.functions.ts"

const SCORE_STALE_TIME = 5 * 60_000

export function useProjectAgentScore(projectId: string, date?: string) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score", projectId, date],
    queryFn: () => getProjectAgentScore({ data: { ...projectScopeData(scope), projectId, date } }),
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0,
  })
}

export function useProjectAgentScoreHistory(projectId: string, date: string | undefined) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score-history", projectId, date],
    queryFn: date
      ? () => getProjectAgentScoreHistory({ data: { ...projectScopeData(scope), projectId, date } })
      : skipToken,
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0 && date !== undefined,
  })
}

export function useProjectAgentScoreExplanation(projectId: string, date: string | undefined) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score-explanation", projectId, date],
    queryFn: date
      ? () => getProjectAgentScoreExplanation({ data: { ...projectScopeData(scope), projectId, date } })
      : skipToken,
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0 && date !== undefined,
  })
}
