import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  countTracesByProject,
  getTraceDetail,
  listTracesByProject,
  type TraceDetailRecord,
  type TraceRecord,
} from "./traces.functions.ts"

const BATCH_SIZE = 50

export function useTracesInfiniteScroll({
  projectId,
  sorting,
}: {
  readonly projectId: string
  readonly sorting: InfiniteTableSorting
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["traces", projectId, sorting],
    queryFn: async ({ pageParam }) => {
      const result = await listTracesByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
        },
      })
      return result ?? { traces: [], hasMore: false }
    },
    initialPageParam: undefined as { sortValue: string; traceId: string } | undefined,
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

  const data: readonly TraceRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.traces ?? []) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}

export function useTracesCount({ projectId }: { readonly projectId: string }) {
  const { data: totalCount = 0, isLoading } = useQuery({
    queryKey: ["traces-count", projectId],
    queryFn: () => countTracesByProject({ data: { projectId } }),
    staleTime: 30_000,
  })

  return { totalCount, isLoading }
}

export function useTraceDetail({ projectId, traceId }: { readonly projectId: string; readonly traceId: string }) {
  return useQuery({
    queryKey: ["traceDetail", projectId, traceId],
    // getTraceDetail returns `never` at the type level to satisfy TanStack Start's
    // Serialize constraint (see traces.functions.ts); cast back to the actual type
    queryFn: async () => {
      const result = await getTraceDetail({ data: { projectId, traceId } })
      return result as TraceDetailRecord | null
    },
  })
}
