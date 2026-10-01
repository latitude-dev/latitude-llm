import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { mergeSessionAssessmentPages } from "./session-assessment-pages.ts"
import { getSessionAssessmentPage } from "./session-assessments.functions.ts"

export function useSessionAssessment({
  projectId,
  sessionId,
}: {
  readonly projectId: string
  readonly sessionId: string
}) {
  const query = useInfiniteQuery({
    queryKey: ["session-assessment", projectId, sessionId],
    queryFn: ({ pageParam }) =>
      getSessionAssessmentPage({
        data: {
          projectId,
          sessionId,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: projectId.length > 0 && sessionId.length > 0,
  })

  const data = useMemo(() => mergeSessionAssessmentPages(query.data?.pages), [query.data?.pages])
  return { ...query, data }
}
