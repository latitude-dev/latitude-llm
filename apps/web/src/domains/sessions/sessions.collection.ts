import type { FilterSet } from "@domain/shared"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  countSessionsByProject,
  getSessionDistinctValues,
  getSessionMetricsByProject,
  listSessionsByProject,
  type SessionRecord,
  type SessionSearchMatchRecord,
} from "./sessions.functions.ts"

const BATCH_SIZE = 50

export function useSessionsInfiniteScroll({
  projectId,
  sorting,
  filters,
  searchQuery,
}: {
  readonly projectId: string
  readonly sorting: InfiniteTableSorting
  readonly filters?: FilterSet
  readonly searchQuery?: string
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["sessionsInfiniteScroll", projectId, sorting, filters, searchQuery],
    queryFn: async ({ pageParam }) => {
      const result = await listSessionsByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
          filters,
          ...(searchQuery ? { searchQuery } : {}),
        },
      })
      return result ?? { sessions: [], hasMore: false }
    },
    initialPageParam: undefined as
      | { sortValue: string; secondaryValue?: string | undefined; sessionId: string }
      | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const data: readonly SessionRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.sessions ?? []) ?? [],
    [paginatedData],
  )

  // `searchMatches` is page-level metadata — every page carries the same
  // shape (keyed by `sessionId`), so merging them in arrival order gives
  // the caller a single lookup table covering every visible session.
  const searchMatches: Readonly<Record<string, SessionSearchMatchRecord>> | undefined = useMemo(() => {
    if (!searchQuery) return undefined
    const merged: Record<string, SessionSearchMatchRecord> = {}
    for (const page of paginatedData?.pages ?? []) {
      if (!page?.searchMatches) continue
      Object.assign(merged, page.searchMatches)
    }
    return merged
  }, [paginatedData, searchQuery])

  return { data, isLoading, infiniteScroll, searchMatches }
}

/**
 * Counts sessions for a project with optional filters + free-text search.
 * When `searchQuery` is non-empty the response also includes
 * `matchingTraceCount` so the UI can render "N sessions · M matching traces".
 */
export function useSessionsCount({
  projectId,
  filters,
  searchQuery,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
  readonly searchQuery?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["sessionsCount", projectId, filters, searchQuery],
    queryFn: () =>
      countSessionsByProject({
        data: {
          projectId,
          ...(filters ? { filters } : {}),
          ...(searchQuery ? { searchQuery } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })

  return {
    totalCount: data?.totalCount ?? 0,
    matchingTraceCount: data?.matchingTraceCount,
    isLoading,
  }
}

export function useSessionMetrics({
  projectId,
  filters,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
}) {
  return useQuery({
    queryKey: ["sessions-metrics", projectId, filters],
    queryFn: () =>
      getSessionMetricsByProject({
        data: {
          projectId,
          ...(filters ? { filters } : {}),
        },
      }),
    staleTime: 30_000,
  })
}

export function useSessionDistinctValues({
  projectId,
  column,
  search,
  enabled = true,
}: {
  readonly projectId: string
  readonly column: "tags" | "models" | "providers" | "serviceNames"
  readonly search?: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["session-distinct", projectId, column, search],
    queryFn: () => getSessionDistinctValues({ data: { projectId, column, limit: 50, ...(search ? { search } : {}) } }),
    staleTime: 60_000,
    enabled: enabled && projectId.length > 0,
    // Keep the previous matches visible while the next query for a new search
    // term is in flight, so the dropdown doesn't flash empty on every keystroke.
    placeholderData: keepPreviousData,
  })
}
