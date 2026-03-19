import type { DatasetListSortBy } from "@domain/datasets"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { DatasetRecord, DatasetRowRecord } from "./datasets.functions.ts"
import { listDatasetsByProject, listRowsQuery } from "./datasets.functions.ts"

const queryClient = getQueryClient()

const BATCH_SIZE = 50

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

/** First page of datasets for dropdowns and lookups. */
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

const makeDatasetRowsCollection = (datasetId: string, search?: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["datasetRows", datasetId, search ?? ""],
      queryFn: async () => {
        const result = await listRowsQuery({
          data: {
            datasetId,
            ...(search ? { search } : {}),
            limit: 50,
            offset: 0,
          },
        })
        return result.rows as DatasetRowRecord[]
      },
      getKey: (item: DatasetRowRecord) => item.rowId,
    }),
  )

type DatasetRowsCollection = ReturnType<typeof makeDatasetRowsCollection>
const MAX_ROW_COLLECTIONS = 10
const rowsCollectionsCache = new Map<string, DatasetRowsCollection>()

const getDatasetRowsCollection = (datasetId: string, search?: string): DatasetRowsCollection => {
  const cacheKey = `${datasetId}:${search ?? ""}`
  const cached = rowsCollectionsCache.get(cacheKey)
  if (cached) {
    rowsCollectionsCache.delete(cacheKey)
    rowsCollectionsCache.set(cacheKey, cached)
    return cached
  }

  const collection = makeDatasetRowsCollection(datasetId, search)
  rowsCollectionsCache.set(cacheKey, collection)

  if (rowsCollectionsCache.size > MAX_ROW_COLLECTIONS) {
    const oldest = rowsCollectionsCache.keys().next().value
    if (oldest) {
      rowsCollectionsCache.delete(oldest)
    }
  }

  return collection
}

export const useDatasetRowsCollection = (datasetId: string, search?: string) => {
  const collection = getDatasetRowsCollection(datasetId, search)
  return useLiveQuery((q) => q.from({ row: collection }), [datasetId, search])
}
