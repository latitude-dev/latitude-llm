import { useQuery } from "@tanstack/react-query"
import { getTaxonomyOverview } from "./taxonomy.functions.ts"

const taxonomyOverviewQueryKey = (projectId: string) => ["taxonomyOverview", projectId] as const

export function useTaxonomyOverview(projectId: string) {
  return useQuery({
    queryKey: taxonomyOverviewQueryKey(projectId),
    queryFn: () => getTaxonomyOverview({ data: { projectId } }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })
}
