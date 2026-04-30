import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createSavedSearchFn,
  deleteSavedSearchFn,
  getSavedSearchBySlugFn,
  listSavedSearchesByProject,
  type SavedSearchRecord,
  updateSavedSearchFn,
} from "./saved-searches.functions.ts"

const listKey = (projectId: string) => ["savedSearches", projectId] as const
const slugKey = (projectId: string, slug: string) => ["savedSearches", projectId, "slug", slug] as const

export function useSavedSearchesList(projectId: string) {
  const { data, isLoading } = useQuery({
    queryKey: listKey(projectId),
    queryFn: () => listSavedSearchesByProject({ data: { projectId } }),
    staleTime: 30_000,
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
      readonly assignedUserId?: string | null
    }) => updateSavedSearchFn({ data: input }),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId) })
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
