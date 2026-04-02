import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type AnnotationQueueItemRecord, listAnnotationQueueItemsByQueue } from "./annotation-queue-items.functions.ts"

const BATCH_SIZE = 50

export const ANNOTATION_QUEUE_ITEMS_DEFAULT_SORTING: InfiniteTableSorting = {
  column: "status",
  direction: "asc",
}

export function useAnnotationQueueItemsInfiniteScroll({
  projectId,
  queueId,
  sorting,
}: {
  readonly projectId: string
  readonly queueId: string
  readonly sorting: InfiniteTableSorting
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["annotation-queue-items", projectId, queueId, sorting.column, sorting.direction],
    queryFn: async ({ pageParam }) => {
      const sortBy = sorting.column === "createdAt" ? "createdAt" : "status"
      const sortDirection =
        sorting.column === "createdAt" || sorting.column === "status"
          ? sorting.direction
          : ANNOTATION_QUEUE_ITEMS_DEFAULT_SORTING.direction
      const result = await listAnnotationQueueItemsByQueue({
        data: {
          projectId,
          queueId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy,
          sortDirection,
        },
      })
      return result ?? { items: [], hasMore: false }
    },
    initialPageParam: undefined as { sortValue: string; id: string; statusRank?: number } | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
    enabled: projectId.length > 0 && queueId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const data: readonly AnnotationQueueItemRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.items ?? []) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}
