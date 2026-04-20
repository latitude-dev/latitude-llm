import { isManualQueue, isSystemQueue } from "@domain/annotation-queues"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  type AnnotationQueueRecord,
  getAnnotationQueueByProject,
  listAnnotationQueuesByProject,
} from "./annotation-queues.functions.ts"

const BATCH_SIZE = 50

export const annotationQueueQueryKey = (projectId: string, queueId: string) =>
  ["annotation-queue", projectId, queueId] as const

export const ANNOTATION_QUEUES_DEFAULT_SORTING: InfiniteTableSorting = {
  column: "pending",
  direction: "desc",
}

function mapSortColumn(column: string): "createdAt" | "name" | "completedItems" | "pendingItems" {
  if (column === "name") return "name"
  if (column === "completed") return "completedItems"
  if (column === "pending") return "pendingItems"
  return "createdAt"
}

export function useAnnotationQueuesInfiniteScroll({
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
    queryKey: ["annotation-queues", projectId, sorting],
    queryFn: async ({ pageParam }) => {
      const result = await listAnnotationQueuesByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: mapSortColumn(sorting.column),
          sortDirection: sorting.direction,
        },
      })
      return result ?? { queues: [], hasMore: false }
    },
    initialPageParam: undefined as { sortValue: string; id: string } | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
    enabled: projectId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const data: readonly AnnotationQueueRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.queues ?? []) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}

export function useAnnotationQueue({
  projectId,
  queueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly queueId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: annotationQueueQueryKey(projectId, queueId),
    queryFn: () => getAnnotationQueueByProject({ data: { projectId, queueId } }),
    enabled: enabled && projectId.length > 0 && queueId.length > 0,
  })
}

export function useAnnotationQueuesList(projectId: string) {
  const { data: paginatedData, isLoading } = useInfiniteQuery({
    queryKey: ["annotation-queues-list", projectId],
    queryFn: async ({ pageParam }) => {
      const result = await listAnnotationQueuesByProject({
        data: {
          projectId,
          limit: 100,
          cursor: pageParam,
          sortBy: "name",
          sortDirection: "asc",
        },
      })
      return result ?? { queues: [], hasMore: false }
    },
    initialPageParam: undefined as { sortValue: string; id: string } | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
    enabled: projectId.length > 0,
  })

  const data = useMemo(() => {
    const allQueues = paginatedData?.pages.flatMap((p) => p?.queues ?? []) ?? []
    return allQueues.filter((q) => !isSystemQueue(q) && isManualQueue(q.settings))
  }, [paginatedData])

  return { data, isLoading }
}
