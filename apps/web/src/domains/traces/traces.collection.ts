import type { FilterSet, PercentileTraceFilterField } from "@domain/shared"
import type { TraceSearchHighlightsResult } from "@domain/spans"
import {
  type CohortSummary,
  pickTraceHistogramBucketSeconds,
  resolveTraceHistogramRangeIso,
  type TraceDistribution,
  type TraceTimeHistogramBucket,
} from "@domain/spans"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { use, useMemo } from "react"
import { TraceScopeContext, traceScopeData, traceScopeKey } from "./trace-scope.tsx"
import {
  countTracesByProject,
  getSessionMomentIntelligence,
  getTraceCohortSummary,
  getTraceDetail,
  getTraceDistinctValues,
  getTraceDistribution,
  getTraceMetricsByProject,
  getTraceSearchHighlights,
  getTraceTimeHistogramByProject,
  listTracesByProject,
  type SessionMomentIntelligenceRecord,
  type TraceDetailRecord,
  type TraceRecord,
} from "./traces.functions.ts"

const traceDetailQueryKey = (projectId: string, traceId: string) => ["traceDetail", projectId, traceId] as const
const sessionMomentIntelligenceQueryKey = (projectId: string, sessionId: string) =>
  ["sessionMomentIntelligence", projectId, sessionId] as const

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
  const scope = use(TraceScopeContext)
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...traceScopeKey(scope), "traces", projectId, sorting, filters, searchQuery],
    queryFn: async ({ pageParam }) => {
      const result = await listTracesByProject({
        data: {
          ...traceScopeData(scope),
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
    initialPageParam: undefined as
      | { sortValue: string; secondaryValue?: string | undefined; traceId: string }
      | undefined,
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
  const scope = use(TraceScopeContext)
  const { data: totalCount = 0, isLoading } = useQuery({
    queryKey: [...traceScopeKey(scope), "traces-count", projectId, filters, searchQuery],
    queryFn: () => countTracesByProject({ data: { ...traceScopeData(scope), projectId, filters, searchQuery } }),
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "traces-metrics", projectId, filters, searchQuery],
    queryFn: () =>
      getTraceMetricsByProject({
        data: {
          ...traceScopeData(scope),
          projectId,
          ...(filters ? { filters } : {}),
          ...(searchQuery ? { searchQuery } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })
}

export function useTraceCohortSummary({ projectId }: { readonly projectId: string }) {
  const scope = use(TraceScopeContext)
  return useQuery<CohortSummary>({
    queryKey: [...traceScopeKey(scope), "traces-cohort-summary", projectId],
    queryFn: () =>
      getTraceCohortSummary({
        data: { ...traceScopeData(scope), projectId },
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
  const scope = use(TraceScopeContext)
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
        ...traceScopeKey(scope),
        "traces-histogram",
        projectId,
        filters,
        searchQuery,
        effectiveRangeStartIso,
        effectiveRangeEndIso,
        bs,
      ] as const,
    }
  }, [scope, projectId, filters, searchQuery, rangeStartIsoOverride, rangeEndIsoOverride])

  const query = useQuery({
    queryKey,
    queryFn: (): Promise<readonly TraceTimeHistogramBucket[]> =>
      getTraceTimeHistogramByProject({
        data: {
          ...traceScopeData(scope),
          projectId,
          rangeStartIso,
          rangeEndIso,
          bucketSeconds,
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
          ...(searchQuery ? { searchQuery } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })

  return {
    ...query,
    rangeStartIso,
    rangeEndIso,
    bucketSeconds,
  }
}

export function useTraceDistribution({
  projectId,
  field,
  enabled = true,
}: {
  readonly projectId: string
  readonly field: PercentileTraceFilterField
  readonly enabled?: boolean
}) {
  const scope = use(TraceScopeContext)
  return useQuery<TraceDistribution>({
    queryKey: [...traceScopeKey(scope), "trace-distribution", projectId, field],
    queryFn: () => getTraceDistribution({ data: { ...traceScopeData(scope), projectId, field } }),
    // Distribution is intentionally insensitive to other filters and changes
    // slowly relative to a user's interaction window — long stale time keeps
    // the chart steady while picking a threshold.
    staleTime: 60_000,
    enabled: enabled && projectId.length > 0,
  })
}

export function useTraceDistinctValues({
  projectId,
  column,
  search,
  enabled = true,
}: {
  readonly projectId: string
  readonly column: "tags" | "models" | "providers" | "serviceNames" | "tools"
  readonly search?: string
  readonly enabled?: boolean
}) {
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "trace-distinct", projectId, column, search],
    queryFn: () =>
      getTraceDistinctValues({
        data: { ...traceScopeData(scope), projectId, column, limit: 50, ...(search ? { search } : {}) },
      }),
    staleTime: 60_000,
    enabled: enabled && projectId.length > 0,
    // Keep the previous matches visible while the next query for a new search
    // term is in flight, so the dropdown doesn't flash empty on every keystroke.
    placeholderData: keepPreviousData,
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), ...traceDetailQueryKey(projectId, traceId)],
    // getTraceDetail returns `never` at the type level to satisfy TanStack Start's
    // Serialize constraint (see traces.functions.ts); cast back to the actual type
    queryFn: async () => {
      const result = await getTraceDetail({ data: { ...traceScopeData(scope), projectId, traceId } })
      return result as TraceDetailRecord | null
    },
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })
}

export function useSessionMomentIntelligence({
  projectId,
  sessionId,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string | null | undefined
  readonly enabled?: boolean
}) {
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), ...sessionMomentIntelligenceQueryKey(projectId, sessionId ?? "")],
    queryFn: async (): Promise<readonly SessionMomentIntelligenceRecord[]> =>
      getSessionMomentIntelligence({ data: { ...traceScopeData(scope), projectId, sessionId: sessionId ?? "" } }),
    enabled: enabled && projectId.length > 0 && Boolean(sessionId),
  })
}

export function useTraceSearchHighlights({
  projectId,
  traceId,
  searchQuery,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly searchQuery: string
  readonly enabled?: boolean
}) {
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "traceSearchHighlights", projectId, traceId, searchQuery] as const,
    queryFn: async (): Promise<TraceSearchHighlightsResult> => {
      const result = await getTraceSearchHighlights({
        data: { ...traceScopeData(scope), projectId, traceId, searchQuery },
      })
      return result as TraceSearchHighlightsResult
    },
    enabled: enabled && projectId.length > 0 && traceId.length > 0 && searchQuery.length > 0,
    // Deterministic for (traceId, searchQuery); avoid refetch storms on
    // observer remount (drawer close+reopen, tab switch).
    staleTime: 30_000,
  })
}
