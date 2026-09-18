import { useQuery } from "@tanstack/react-query"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  getProjectAgentScore,
  getProjectAgentScoreExplanation,
  getProjectAgentScoreHistory,
} from "./agent-score.functions.ts"

/** The score changes once a day, so a page revisit within the hour has nothing new to read. */
const SCORE_STALE_TIME = 5 * 60_000

export function useProjectAgentScore(projectId: string) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score", projectId],
    queryFn: () => getProjectAgentScore({ data: { ...projectScopeData(scope), projectId } }),
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0,
  })
}

export function useProjectAgentScoreHistory(projectId: string) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score-history", projectId],
    queryFn: () => getProjectAgentScoreHistory({ data: { ...projectScopeData(scope), projectId } }),
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0,
  })
}

/**
 * The cause rows, fetched separately from the score.
 *
 * Its own query so the page paints its numbers from the snapshot without waiting: the explanation
 * comes from a cache the scoring worker warms, and on a miss there is nothing to wait for anyway.
 */
export function useProjectAgentScoreExplanation(projectId: string) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "agent-score-explanation", projectId],
    queryFn: () => getProjectAgentScoreExplanation({ data: { ...projectScopeData(scope), projectId } }),
    staleTime: SCORE_STALE_TIME,
    enabled: projectId.length > 0,
  })
}
