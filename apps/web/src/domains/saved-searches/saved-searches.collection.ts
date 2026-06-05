import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createSavedSearchFn,
  deleteSavedSearchFn,
  getSavedSearchBySlugFn,
  listSavedSearchesByProject,
  type SavedSearchRecord,
  type SavedSearchSearchRecord,
  searchSavedSearchesOrgWide,
  updateSavedSearchFn,
} from "./saved-searches.functions.ts"

const ORG_SEARCH_LIMIT = 8

const listKey = (projectId: string) => ["savedSearches", projectId] as const
const slugKey = (projectId: string, slug: string) => ["savedSearches", projectId, "slug", slug] as const

export function useSavedSearchesList(projectId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: listKey(projectId),
    queryFn: () => listSavedSearchesByProject({ data: { projectId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })
  return { data: data ?? [], isLoading }
}

/**
 * Org-wide saved-search search for the Command Palette. Returns matching saved searches across
 * every project in the organization (each carrying its owning project's slug/name).
 * `preferProjectId` (the current project, when inside one) ranks that project's saved searches first.
 */
export function useSavedSearchesSearch(
  searchQuery: string,
  { enabled = true, preferProjectId }: { enabled?: boolean; preferProjectId?: string | undefined } = {},
) {
  const trimmed = searchQuery.trim()
  const { data, isLoading } = useQuery({
    queryKey: ["savedSearches", "orgSearch", trimmed, preferProjectId ?? null],
    queryFn: (): Promise<readonly SavedSearchSearchRecord[]> =>
      searchSavedSearchesOrgWide({
        data: {
          searchQuery: trimmed,
          limit: ORG_SEARCH_LIMIT,
          ...(preferProjectId ? { preferProjectId } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: enabled && trimmed.length > 0,
  })
  return { data: data ?? [], isLoading }
}

export function useSavedSearchBySlug(projectId: string, slug: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: slug ? slugKey(projectId, slug) : ["savedSearches", projectId, "slug", null],
    queryFn: () => (slug ? getSavedSearchBySlugFn({ data: { projectId, slug } }) : Promise.resolve(null)),
    enabled: !!slug,
    staleTime: 30_000,
  })
  return { data: data ?? null, isLoading }
}

export function useCreateSavedSearch(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      readonly name: string
      readonly query: string | null
      readonly filterSet: SavedSearchRecord["filterSet"]
    }) =>
      createSavedSearchFn({
        data: {
          projectId,
          name: input.name,
          query: input.query,
          filterSet: input.filterSet,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(projectId) }),
  })
}

export function useUpdateSavedSearch(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      readonly id: string
      readonly name?: string
      readonly query?: string | null
      readonly filterSet?: SavedSearchRecord["filterSet"]
    }) => updateSavedSearchFn({ data: input }),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId) })
      // Renames change the slug; invalidate every cached slug query for this project so any
      // subscriber pointing at the previous slug refetches instead of serving a stale entity.
      queryClient.invalidateQueries({ queryKey: ["savedSearches", projectId, "slug"] })
      queryClient.setQueryData(slugKey(projectId, record.slug), record)
    },
  })
}

export function useDeleteSavedSearch(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSavedSearchFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(projectId) }),
  })
}
