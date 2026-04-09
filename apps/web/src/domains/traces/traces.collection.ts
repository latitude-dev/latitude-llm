import type { FilterSet } from "@domain/shared"
import {
  pickTraceHistogramBucketSeconds,
  resolveTraceHistogramRangeIso,
  type TraceTimeHistogramBucket,
} from "@domain/spans"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  countTracesByProject,
  getTraceDetail,
  getTraceDistinctValues,
  getTraceMetricsByProject,
  getTraceTimeHistogramByProject,
  listTracesByProject,
  type TraceDetailRecord,
  type TraceRecord,
} from "./traces.functions.ts"

const BATCH_SIZE = 50

export function useTracesInfiniteScroll({
  projectId,
  sorting,
  filters,
}: {
  readonly projectId: string
  readonly sorting: InfiniteTableSorting
  readonly filters?: FilterSet
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["traces", projectId, sorting, filters],
    queryFn: async ({ pageParam }) => {
      const result = await listTracesByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
          filters,
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

export function useTracesCount({ projectId, filters }: { readonly projectId: string; readonly filters?: FilterSet }) {
  const { data: totalCount = 0, isLoading } = useQuery({
    queryKey: ["traces-count", projectId, filters],
    queryFn: () => countTracesByProject({ data: { projectId, filters } }),
    staleTime: 30_000,
  })

  return { totalCount, isLoading }
}

export function useTraceMetrics({ projectId, filters }: { readonly projectId: string; readonly filters?: FilterSet }) {
  return useQuery({
    queryKey: ["traces-metrics", projectId, filters],
    queryFn: () =>
      getTraceMetricsByProject({
        data: {
          projectId,
          ...(filters ? { filters } : {}),
        },
      }),
    staleTime: 30_000,
  })
}

export function useTraceTimeHistogram({
  projectId,
  filters,
}: {
  readonly projectId: string
  readonly filters: FilterSet
}) {
  const { rangeStartIso, rangeEndIso, bucketSeconds, queryKey } = useMemo(() => {
    const nowMs = Date.now()
    const { rangeStartIso: rs, rangeEndIso: re } = resolveTraceHistogramRangeIso(filters, nowMs)
    const startMs = Date.parse(rs)
    const endMs = Date.parse(re)
    const bs =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? pickTraceHistogramBucketSeconds(startMs, endMs)
        : 60
    return {
      rangeStartIso: rs,
      rangeEndIso: re,
      bucketSeconds: bs,
      queryKey: ["traces-histogram", projectId, filters, rs, re, bs] as const,
    }
  }, [projectId, filters])

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
    queryKey: ["traceDetail", projectId, traceId],
    // getTraceDetail returns `never` at the type level to satisfy TanStack Start's
    // Serialize constraint (see traces.functions.ts); cast back to the actual type
    queryFn: async () => {
      const result = await getTraceDetail({ data: { projectId, traceId } })
      return result as TraceDetailRecord | null
    },
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })
}
