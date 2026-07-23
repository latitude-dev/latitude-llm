import type { MemoryStoreMetricSortField } from "@domain/memories"
import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  getMemoryRecord,
  getMemoryRecordChangeDiff,
  getMemoryRecordReads,
  getMemoryStoreSnapshot,
  getSessionMemoryDiff,
  getSessionMemorySummary,
  listMemoryRecordUsers,
  listMemoryStoresWithMetrics,
  listMemoryStoreUsers,
  listUserMemoryStores,
  type MemoryStoreMetricsRecord,
  type SessionMemoryDiffRecord,
  type SessionMemorySummaryRecord,
} from "./memories.functions.ts"

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

/**
 * A session's (or one trace's) memory writes as per-record before/after diffs
 * for the "Memory changes" section. Heavier than the summary (fetches bodies), so
 * it's fetched only when the section is expanded via `enabled`.
 */
export function useSessionMemoryDiff({
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
    queryKey: [...projectScopeKey(scope), "memory-changes-diff", projectId, sessionId, traceId ?? ""],
    queryFn: async () => {
      const result = await getSessionMemoryDiff({
        data: { ...projectScopeData(scope), projectId, sessionId, ...(traceId ? { traceId } : {}) },
      })
      return result as SessionMemoryDiffRecord
    },
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0 && sessionId.length > 0,
  })
}

/** The project's memory stores with window-scoped insight metrics, for the analytics table. */
export function useMemoryStoresWithMetrics({
  projectId,
  range,
  sort,
  direction,
  trendBucketSeconds,
  limit = 50,
  enabled = true,
}: {
  readonly projectId: string
  readonly range: { readonly fromIso: string; readonly toIso: string }
  readonly sort: MemoryStoreMetricSortField
  readonly direction: "asc" | "desc"
  readonly trendBucketSeconds: number
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [
      ...projectScopeKey(scope),
      "memory-stores-metrics",
      projectId,
      range.fromIso,
      range.toIso,
      sort,
      direction,
      trendBucketSeconds,
      limit,
    ],
    queryFn: ({ pageParam }) =>
      listMemoryStoresWithMetrics({
        data: {
          ...projectScopeData(scope),
          projectId,
          fromIso: range.fromIso,
          toIso: range.toIso,
          sort,
          direction,
          trendBucketSeconds,
          limit,
          offset: pageParam,
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({ hasMore: hasNextPage ?? false, isLoadingMore: isFetchingNextPage, onLoadMore: fetchNextPage }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )
  const stores = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  return {
    stores: stores as readonly MemoryStoreMetricsRecord[],
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

/** One change's before/after bodies for the diff view; keyed on the authoring span. */
export function useMemoryRecordChangeDiff({
  projectId,
  storeId,
  recordId,
  spanId,
  enabled = true,
}: {
  readonly projectId: string
  readonly storeId: string
  readonly recordId: string
  readonly spanId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "memory-record-change-diff", projectId, storeId, recordId, spanId],
    queryFn: () =>
      getMemoryRecordChangeDiff({ data: { ...projectScopeData(scope), projectId, storeId, recordId, spanId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0 && spanId.length > 0,
  })
}

/** One record's retrieval (read) events for the Reads tab; gate with `enabled` so it loads on demand. */
export function useMemoryRecordReads({
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
    queryKey: [...projectScopeKey(scope), "memory-record-reads", projectId, storeId, recordId],
    queryFn: () => getMemoryRecordReads({ data: { ...projectScopeData(scope), projectId, storeId, recordId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })
}

/** The end-users who accessed one record; gate with `enabled` so it loads on demand. */
export function useMemoryRecordUsers({
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
    queryKey: [...projectScopeKey(scope), "memory-record-users", projectId, storeId, recordId],
    queryFn: () => listMemoryRecordUsers({ data: { ...projectScopeData(scope), projectId, storeId, recordId } }),
    staleTime: 30_000,
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

/** The memory stores one end-user accessed, for the user detail page. */
export function useUserMemoryStores({
  projectId,
  userId,
  enabled = true,
}: {
  readonly projectId: string
  readonly userId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "user-memory-stores", projectId, userId],
    queryFn: () => listUserMemoryStores({ data: { ...projectScopeData(scope), projectId, userId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0 && userId.length > 0,
  })
}
