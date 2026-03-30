import type { FilterSet } from "@domain/shared"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  getSessionBySessionId,
  getSessionDistinctValues,
  listSessionsByProject,
  type SessionRecord,
} from "./sessions.functions.ts"

const BATCH_SIZE = 50

export function useSessionsInfiniteScroll({
  projectId,
  sorting,
  filters,
}: {
  readonly projectId: string
  readonly sorting: InfiniteTableSorting
  readonly filters?: FilterSet
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["sessions", projectId, sorting, filters],
    queryFn: async ({ pageParam }) => {
      const result = await listSessionsByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
          filters,
        },
      })
      return result ?? { sessions: [], hasMore: false }
    },
    initialPageParam: undefined as { sortValue: string; sessionId: string } | undefined,
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

  return { data, isLoading, infiniteScroll }
}

export function useSessionDetail({ projectId, sessionId }: { readonly projectId: string; readonly sessionId: string }) {
  return useQuery({
    queryKey: ["session-detail", projectId, sessionId],
    queryFn: async () => {
      const result = await getSessionBySessionId({ data: { projectId, sessionId } })
      return result ?? null
    },
    enabled: sessionId.length > 0,
    staleTime: 30_000,
  })
}

export function useSessionDistinctValues({
  projectId,
  column,
  search,
}: {
  readonly projectId: string
  readonly column: "tags" | "models" | "providers" | "serviceNames"
  readonly search?: string
}) {
  return useQuery({
    queryKey: ["session-distinct", projectId, column, search],
    queryFn: () => getSessionDistinctValues({ data: { projectId, column, limit: 50, ...(search ? { search } : {}) } }),
    staleTime: 60_000,
  })
}
