import type { DatasetListSortBy } from "@domain/datasets"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useDeferredValue, useMemo } from "react"
import type { DatasetRecord, DatasetRowRecord } from "./datasets.functions.ts"
import { listDatasetsByProject, listRowsQuery } from "./datasets.functions.ts"

const BATCH_SIZE = 50
const ROWS_BATCH_SIZE = 50

export function useDatasetsInfiniteScroll({
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
    queryKey: ["datasets", projectId, sorting],
    queryFn: ({ pageParam }) =>
      listDatasetsByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column as DatasetListSortBy,
          sortDirection: sorting.direction,
        },
      }),
    initialPageParam: undefined as { sortValue: string; id: string } | undefined,
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

  const data: readonly DatasetRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.datasets ?? []) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}

type DatasetRowsCursor = { createdAt: string; rowId: string }

export function useDatasetRowsInfiniteScroll({
  datasetId,
  search,
  sorting,
}: {
  readonly datasetId: string
  readonly search?: string
  readonly sorting: InfiniteTableSorting
}) {
  const deferredSearch = useDeferredValue(search ?? "")
  const sortDirection = sorting.column === "createdAt" ? sorting.direction : "desc"

  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["datasetRows", datasetId, deferredSearch, sortDirection],
    queryFn: ({ pageParam }) =>
      listRowsQuery({
        data: {
          datasetId,
          limit: ROWS_BATCH_SIZE,
          sortBy: "createdAt",
          sortDirection,
          ...(deferredSearch ? { search: deferredSearch } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    initialPageParam: undefined as DatasetRowsCursor | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
    placeholderData: keepPreviousData,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const data: readonly DatasetRowRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.rows ?? []) ?? [],
    [paginatedData],
  )

  const total = paginatedData?.pages[0]?.total

  return { data, isLoading, infiniteScroll, total }
}

export function useDatasetsList(projectId: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["datasets", projectId, { limit: 100 }],
    queryFn: async () => {
      const page = await listDatasetsByProject({
        data: { projectId, limit: 100, sortBy: "name", sortDirection: "asc" },
      })
      return page.datasets
    },
    staleTime: 30_000,
  })
  return { data: data ?? [], isLoading }
}
