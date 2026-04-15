import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo } from "react"
import { annotationQueueQueryKey } from "../annotation-queues/annotation-queues.collection.ts"
import { annotationsByTraceQueryKey } from "../annotations/annotations.collection.ts"
import { listAnnotationsByTrace } from "../annotations/annotations.functions.ts"
import { traceDetailQueryKey } from "../traces/traces.collection.ts"
import { getTraceDetail } from "../traces/traces.functions.ts"
import {
  type AnnotationQueueItemRecord,
  completeQueueItem,
  getAnnotationQueueItemDetail,
  getQueueItemNavigation,
  listAnnotationQueueItemsByQueue,
  uncompleteQueueItem,
} from "./annotation-queue-items.functions.ts"

const BATCH_SIZE = 50

export const ANNOTATION_QUEUE_ITEMS_DEFAULT_SORTING: InfiniteTableSorting = {
  column: "status",
  direction: "asc",
}

const annotationQueueItemsQueryKey = (projectId: string, queueId: string) =>
  ["annotation-queue-items", projectId, queueId] as const

const annotationQueueItemQueryKey = (projectId: string, queueId: string, itemId: string) =>
  ["annotation-queue-item", projectId, queueId, itemId] as const

const queueItemNavigationQueryKey = (projectId: string, queueId: string, itemId: string) =>
  ["queue-item-navigation", projectId, queueId, itemId] as const

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
    queryKey: [...annotationQueueItemsQueryKey(projectId, queueId), sorting.column, sorting.direction],
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

export function useAnnotationQueueItem({
  projectId,
  queueId,
  itemId,
  enabled = true,
}: {
  readonly projectId: string
  readonly queueId: string
  readonly itemId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: annotationQueueItemQueryKey(projectId, queueId, itemId),
    queryFn: () => getAnnotationQueueItemDetail({ data: { projectId, queueId, itemId } }),
    enabled: enabled && projectId.length > 0 && queueId.length > 0 && itemId.length > 0,
  })
}

function usePrefetchNavigationItems({
  projectId,
  queueId,
  previousItemId,
  nextItemId,
}: {
  readonly projectId: string
  readonly queueId: string
  readonly previousItemId: string | null | undefined
  readonly nextItemId: string | null | undefined
}) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!projectId) return

    const prefetchItem = async (adjacentItemId: string | null | undefined) => {
      if (!adjacentItemId) return

      const item = await queryClient.fetchQuery({
        queryKey: annotationQueueItemQueryKey(projectId, queueId, adjacentItemId),
        queryFn: () => getAnnotationQueueItemDetail({ data: { projectId, queueId, itemId: adjacentItemId } }),
        staleTime: 120_000,
      })

      if (!item?.traceId) return

      queryClient.prefetchQuery({
        queryKey: traceDetailQueryKey(projectId, item.traceId),
        queryFn: () => getTraceDetail({ data: { projectId, traceId: item.traceId } }),
        staleTime: 120_000,
      })

      queryClient.prefetchQuery({
        queryKey: annotationsByTraceQueryKey(projectId, item.traceId),
        queryFn: () => listAnnotationsByTrace({ data: { projectId, traceId: item.traceId, draftMode: "include" } }),
        staleTime: 120_000,
      })
    }

    prefetchItem(previousItemId)
    prefetchItem(nextItemId)
  }, [queryClient, projectId, queueId, previousItemId, nextItemId])
}

export function useQueueItemNavigation({
  projectSlug,
  projectId,
  queueId,
  itemId,
  onQueueAllComplete,
}: {
  readonly projectSlug: string
  readonly projectId: string
  readonly queueId: string
  readonly itemId: string
  readonly onQueueAllComplete?: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: navigation, isLoading } = useQuery({
    queryKey: queueItemNavigationQueryKey(projectId, queueId, itemId),
    queryFn: () => getQueueItemNavigation({ data: { projectId, queueId, itemId } }),
    enabled: projectId.length > 0 && queueId.length > 0 && itemId.length > 0,
  })

  usePrefetchNavigationItems({
    projectId,
    queueId,
    previousItemId: navigation?.previousItemId,
    nextItemId: navigation?.nextItemId,
  })

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queueItemNavigationQueryKey(projectId, queueId, itemId) })
    queryClient.invalidateQueries({ queryKey: annotationQueueItemQueryKey(projectId, queueId, itemId) })
    queryClient.invalidateQueries({ queryKey: annotationQueueQueryKey(projectId, queueId) })
    queryClient.invalidateQueries({ queryKey: annotationQueueItemsQueryKey(projectId, queueId) })
  }, [queryClient, projectId, queueId, itemId])

  const completeMutation = useMutation({
    mutationFn: () => completeQueueItem({ data: { projectId, queueId, itemId } }),
    onSuccess: (result) => {
      invalidateQueries()
      if (result.nextItemId) {
        navigate({
          to: "/projects/$projectSlug/annotation-queues/$queueId/items/$itemId",
          params: { projectSlug, queueId, itemId: result.nextItemId },
        })
      } else {
        onQueueAllComplete?.()
      }
    },
  })

  const uncompleteMutation = useMutation({
    mutationFn: () => uncompleteQueueItem({ data: { projectId, queueId, itemId } }),
    onSuccess: () => {
      invalidateQueries()
    },
  })

  const navigateTo = useCallback(
    (targetItemId: string | null) => {
      if (!targetItemId) return
      navigate({
        to: "/projects/$projectSlug/annotation-queues/$queueId/items/$itemId",
        params: { projectSlug, queueId, itemId: targetItemId },
      })
    },
    [navigate, projectSlug, queueId],
  )

  return {
    previousItemId: navigation?.previousItemId ?? null,
    nextItemId: navigation?.nextItemId ?? null,
    currentIndex: navigation?.currentIndex ?? 0,
    totalItems: navigation?.totalItems ?? 0,
    isLoading,
    navigateToPrevious: useCallback(
      () => navigateTo(navigation?.previousItemId ?? null),
      [navigateTo, navigation?.previousItemId],
    ),
    navigateToNext: useCallback(() => navigateTo(navigation?.nextItemId ?? null), [navigateTo, navigation?.nextItemId]),
    complete: completeMutation.mutate,
    uncomplete: uncompleteMutation.mutate,
    isCompleting: completeMutation.isPending,
    isUncompleting: uncompleteMutation.isPending,
  }
}
