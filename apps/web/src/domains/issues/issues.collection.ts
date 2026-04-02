import { useQuery } from "@tanstack/react-query"
import { listIssues } from "./issues.functions.ts"

export function useListIssues({
  projectId,
  enabled = true,
}: {
  readonly projectId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["issues", projectId],
    queryFn: () => listIssues({ data: { projectId, limit: 100, offset: 0 } }),
    enabled,
    staleTime: 30_000,
  })
}
