import { useQuery } from "@tanstack/react-query"
import { getSessionAssessmentPage } from "./session-assessments.functions.ts"

export function useSessionAssessment({
  projectId,
  sessionId,
}: {
  readonly projectId: string
  readonly sessionId: string
}) {
  return useQuery({
    queryKey: ["session-assessment", projectId, sessionId],
    queryFn: () => getSessionAssessmentPage({ data: { projectId, sessionId } }),
    enabled: projectId.length > 0 && sessionId.length > 0,
  })
}
