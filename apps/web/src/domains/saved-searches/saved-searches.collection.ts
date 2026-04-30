import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  countAnnotatedTracesByProject,
  countTracesByProject,
  findLastTraceAtByProject,
} from "../traces/traces.functions.ts"
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

export interface SavedSearchAggregates {
  readonly total: number | undefined
  readonly totalLoading: boolean
  readonly annotated: number | undefined
  readonly annotatedLoading: boolean
  readonly lastFoundAt: Date | null | undefined
  readonly lastFoundLoading: boolean
}

const aggregateInputs = (savedSearch: SavedSearchRecord) => ({
  projectId: savedSearch.projectId,
  ...(savedSearch.query ? { searchQuery: savedSearch.query } : {}),
  ...(Object.keys(savedSearch.filterSet).length > 0 ? { filterSet: savedSearch.filterSet } : {}),
})

const aggregateKey = (kind: string, savedSearch: SavedSearchRecord) =>
  [
    "savedSearchAggregate",
    kind,
    savedSearch.projectId,
    savedSearch.id,
    savedSearch.query ?? "",
    savedSearch.filterSet,
  ] as const

export function useSavedSearchAggregates(savedSearch: SavedSearchRecord): SavedSearchAggregates {
  const inputs = aggregateInputs(savedSearch)
  const [totalQuery, annotatedQuery, lastFoundQuery] = useQueries({
    queries: [
      {
        queryKey: aggregateKey("total", savedSearch),
        queryFn: () => countTracesByProject({ data: inputs }),
        staleTime: 30_000,
      },
      {
        queryKey: aggregateKey("annotated", savedSearch),
        queryFn: () => countAnnotatedTracesByProject({ data: inputs }),
        staleTime: 30_000,
      },
      {
        queryKey: aggregateKey("lastFound", savedSearch),
        queryFn: () => findLastTraceAtByProject({ data: inputs }),
        staleTime: 30_000,
      },
    ],
  })

  return {
    total: totalQuery.data,
    totalLoading: totalQuery.isLoading,
    annotated: annotatedQuery.data,
    annotatedLoading: annotatedQuery.isLoading,
    lastFoundAt:
      lastFoundQuery.data === undefined ? undefined : lastFoundQuery.data ? new Date(lastFoundQuery.data) : null,
    lastFoundLoading: lastFoundQuery.isLoading,
  }
}
