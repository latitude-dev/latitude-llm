import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  getMemoryRecord,
  getMemoryStoreSnapshot,
  getSessionMemorySummary,
  listMemoryStores,
  listMemoryStoreUsers,
  type MemoryStoreRecord,
  type SessionMemorySummaryRecord,
} from "./memories.functions.ts"

type MemoryStoreSortField = "lastUpdated" | "lastRead" | "records" | "tokens" | "sessions" | "users"

/**
 * Memory footprint for a session's summary chip; pass `traceId` to restrict it
 * to a single trace's contribution (the trace-drawer chip).
 */
export function useMemorySummary({
  projectId,
  sessionId,
  traceId,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceId?: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "memory-summary", projectId, sessionId, traceId ?? ""],
    queryFn: async () => {
      const result = await getSessionMemorySummary({
        data: { ...projectScopeData(scope), projectId, sessionId, ...(traceId ? { traceId } : {}) },
      })
      return result as SessionMemorySummaryRecord
    },
    enabled: enabled && projectId.length > 0 && sessionId.length > 0,
  })
}

/** The project's memory stores, server-sorted and paginated for the store-list table. */
export function useMemoryStores({
  projectId,
  sort,
  direction,
  limit = 50,
  enabled = true,
}: {
  readonly projectId: string
  readonly sort: MemoryStoreSortField
  readonly direction: "asc" | "desc"
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...projectScopeKey(scope), "memory-stores", projectId, sort, direction, limit],
    queryFn: ({ pageParam }) =>
      listMemoryStores({ data: { ...projectScopeData(scope), projectId, sort, direction, limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({ hasMore: hasNextPage ?? false, isLoadingMore: isFetchingNextPage, onLoadMore: fetchNextPage }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )
  const stores = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  return {
    stores: stores as readonly MemoryStoreRecord[],
    totalCount: data?.pages[0]?.totalCount ?? 0,
    isLoading,
    infiniteScroll,
  }
}

/** One store's current record ids for the detail filetree. */
export function useMemoryStoreSnapshot({
  projectId,
  storeId,
  enabled = true,
}: {
  readonly projectId: string
  readonly storeId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "memory-store-snapshot", projectId, storeId],
    queryFn: () => getMemoryStoreSnapshot({ data: { ...projectScopeData(scope), projectId, storeId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })
}

/** The selected record's current body plus its update history. */
export function useMemoryRecord({
  projectId,
  storeId,
  recordId,
  enabled = true,
}: {
  readonly projectId: string
  readonly storeId: string
  readonly recordId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "memory-record", projectId, storeId, recordId],
    queryFn: () => getMemoryRecord({ data: { ...projectScopeData(scope), projectId, storeId, recordId } }),
    staleTime: 30_000,
    // No `recordId.length` guard: the unnamed record (id `''`) is a valid selection.
    enabled: enabled && projectId.length > 0,
  })
}

/** The end-users who accessed one store. */
export function useMemoryStoreUsers({
  projectId,
  storeId,
  enabled = true,
}: {
  readonly projectId: string
  readonly storeId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "memory-store-users", projectId, storeId],
    queryFn: () => listMemoryStoreUsers({ data: { ...projectScopeData(scope), projectId, storeId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })
}
