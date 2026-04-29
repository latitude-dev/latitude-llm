import type { FilterSet } from "@domain/shared"
import {
  pickTraceHistogramBucketSeconds,
  resolveTraceHistogramRangeIso,
  type TraceCohortSummary,
  type TraceTimeHistogramBucket,
} from "@domain/spans"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  countTracesByProject,
  getTraceCohortSummaryByTags,
  getTraceDetail,
  getTraceDistinctValues,
  getTraceMetricsByProject,
  getTraceTimeHistogramByProject,
  listTracesByProject,
  type TraceDetailRecord,
  type TraceRecord,
} from "./traces.functions.ts"

const traceDetailQueryKey = (projectId: string, traceId: string) => ["traceDetail", projectId, traceId] as const

const BATCH_SIZE = 50

export function useTracesInfiniteScroll({
  projectId,
  sorting,
  filters,
  searchQuery,
}: {
  readonly projectId: string
  readonly sorting: InfiniteTableSorting
  readonly filters?: FilterSet
  readonly searchQuery?: string
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["traces", projectId, sorting, filters, searchQuery],
    queryFn: async ({ pageParam }) => {
      const result = await listTracesByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
          filters,
          searchQuery,
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

export function useTracesCount({
  projectId,
  filters,
  searchQuery,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
  readonly searchQuery?: string
}) {
  const { data: totalCount = 0, isLoading } = useQuery({
    queryKey: ["traces-count", projectId, filters, searchQuery],
    queryFn: () => countTracesByProject({ data: { projectId, filters, searchQuery } }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })

  return { totalCount, isLoading }
}

export function useTraceMetrics({
  projectId,
  filters,
  searchQuery,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
  readonly searchQuery?: string
}) {
  return useQuery({
    queryKey: ["traces-metrics", projectId, filters, searchQuery],
    queryFn: () =>
      getTraceMetricsByProject({
        data: {
          projectId,
          ...(filters ? { filters } : {}),
          ...(searchQuery ? { searchQuery } : {}),
        },
      }),
    staleTime: 30_000,
  })
}

export function useTraceCohortSummaryByTags({
  projectId,
  tags,
}: {
  readonly projectId: string
  readonly tags: ReadonlyArray<string>
}) {
  // Canonicalize the tag combination for a stable cache key: dedupe + sort so that
  // ["a","b"] and ["b","a"] share a single query. Tag comparison is case-sensitive
  // on the backend (ClickHouse String equality), so do NOT lowercase.
  const sortedTags = useMemo(() => [...new Set(tags)].sort(), [tags])
  return useQuery<TraceCohortSummary>({
    queryKey: ["traces-cohort-summary-by-tags", projectId, sortedTags],
    queryFn: () =>
      getTraceCohortSummaryByTags({
        data: {
          projectId,
          tags: sortedTags,
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })
}

export function useTraceTimeHistogram({
  projectId,
  filters,
  searchQuery,
  rangeStartIso: rangeStartIsoOverride,
  rangeEndIso: rangeEndIsoOverride,
}: {
  readonly projectId: string
  readonly filters: FilterSet
  readonly searchQuery?: string
  readonly rangeStartIso?: string
  readonly rangeEndIso?: string
}) {
  const { rangeStartIso, rangeEndIso, bucketSeconds, queryKey } = useMemo(() => {
    const nowMs = Date.now()
    const { rangeStartIso: rs, rangeEndIso: re } = resolveTraceHistogramRangeIso(filters, nowMs)
    const effectiveRangeStartIso = rangeStartIsoOverride ?? rs
    const effectiveRangeEndIso = rangeEndIsoOverride ?? re
    const startMs = Date.parse(effectiveRangeStartIso)
    const endMs = Date.parse(effectiveRangeEndIso)
    const bs =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? pickTraceHistogramBucketSeconds(startMs, endMs)
        : 60
    return {
      rangeStartIso: effectiveRangeStartIso,
      rangeEndIso: effectiveRangeEndIso,
      bucketSeconds: bs,
      queryKey: [
        "traces-histogram",
        projectId,
        filters,
        searchQuery,
        effectiveRangeStartIso,
        effectiveRangeEndIso,
        bs,
      ] as const,
    }
  }, [projectId, filters, searchQuery, rangeStartIsoOverride, rangeEndIsoOverride])

  const query = useQuery({
    queryKey,
    queryFn: (): Promise<readonly TraceTimeHistogramBucket[]> =>
      getTraceTimeHistogramByProject({
        data: {
          projectId,
          rangeStartIso,
          rangeEndIso,
          bucketSeconds,
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
          ...(searchQuery ? { searchQuery } : {}),
        },
      }),
    staleTime: 30_000,
  })

  return {
    ...query,
    rangeStartIso,
    rangeEndIso,
    bucketSeconds,
  }
}

export function useTraceDistinctValues({
  projectId,
  column,
  search,
}: {
  readonly projectId: string
  readonly column: "tags" | "models" | "providers" | "serviceNames"
  readonly search?: string
}) {
  return useQuery({
    queryKey: ["trace-distinct", projectId, column, search],
    queryFn: () => getTraceDistinctValues({ data: { projectId, column, limit: 50, ...(search ? { search } : {}) } }),
    staleTime: 60_000,
    enabled: projectId.length > 0,
  })
}

export function useTraceDetail({
  projectId,
  traceId,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: traceDetailQueryKey(projectId, traceId),
    // getTraceDetail returns `never` at the type level to satisfy TanStack Start's
    // Serialize constraint (see traces.functions.ts); cast back to the actual type
    queryFn: async () => {
      const result = await getTraceDetail({ data: { projectId, traceId } })
      return result as TraceDetailRecord | null
    },
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })
}
