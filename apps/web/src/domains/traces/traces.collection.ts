import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { countTracesByProject, listTracesByProject, type TraceRecord } from "./traces.functions.ts"

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
    queryFn: ({ pageParam }) =>
      listTracesByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
        },
      }),
    initialPageParam: undefined as { sortValue: string; traceId: string } | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
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
    () => paginatedData?.pages.flatMap((p) => p.traces) ?? [],
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
