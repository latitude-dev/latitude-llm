import { useQuery } from "@tanstack/react-query"
import { type BehaviourCatalogEntryRecord, getBehaviourCatalog } from "./behaviour-catalog.functions.ts"

export const behaviourCatalogKey = (projectId: string) => ["behaviourCatalog", projectId] as const
const catalogKey = behaviourCatalogKey

const EMPTY_CATALOG: readonly BehaviourCatalogEntryRecord[] = []

/**
 * The Behaviors home list. Polls while any behavior is still gardening so a
 * freshly created panel fills in with its groups without a reload.
 */
export function useBehaviourCatalog(projectId: string, { enabled = true } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: catalogKey(projectId),
    queryFn: () => getBehaviourCatalog({ data: { projectId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((entry) => entry.status === "generating") ? 10_000 : false,
  })
  return { data: data ?? EMPTY_CATALOG, isLoading }
}
