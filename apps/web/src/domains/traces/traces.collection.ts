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
import { useMemo } from "react"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  countTracesByProject,
  getProjectFirstTraceAt,
  getProjectLastTraceAt,
  getSessionMomentIntelligence,
  getSpanConversationChunk,
  getTraceCohortSummary,
  getTraceConversationChunk,
  getTraceDetail,
  getTraceDistinctValues,
  getTraceDistribution,
  getTraceMetricsByProject,
  getTraceSearchHighlights,
  getTraceTimeHistogramByProject,
  listTracesByProject,
  type SessionMomentIntelligenceRecord,
  type TraceConversationChunkRecord,
  type TraceDetailRecord,
  type TraceRecord,
} from "./traces.functions.ts"

const traceDetailQueryKey = (projectId: string, traceId: string) => ["traceDetail", projectId, traceId] as const
const sessionMomentIntelligenceQueryKey = (projectId: string, sessionId: string) =>
  ["sessionMomentIntelligence", projectId, sessionId] as const

const BATCH_SIZE = 50
const CONVERSATION_CHUNK_SIZE = 25

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
  const scope = useProjectScope()
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...projectScopeKey(scope), "traces", projectId, sorting, filters, searchQuery],
    queryFn: async ({ pageParam }) => {
      const result = await listTracesByProject({
        data: {
          ...projectScopeData(scope),
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
  enabled = true,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
  readonly searchQuery?: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const {
    data: totalCount = 0,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [...projectScopeKey(scope), "traces-count", projectId, filters, searchQuery],
    queryFn: () => countTracesByProject({ data: { ...projectScopeData(scope), projectId, filters, searchQuery } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })

  return { totalCount, isLoading, isError }
}

/**
 * Latest trace `start_time` (ISO) matching `filters`, or null. Used to anchor the histogram to
 * real activity when the list is showing "All time" but recent activity is empty.
 */
export function useProjectLastTraceAt({
  projectId,
  filters,
  searchQuery,
  enabled = true,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
  readonly searchQuery?: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const { data = null } = useQuery({
    queryKey: [...projectScopeKey(scope), "traces-last-at", projectId, filters, searchQuery],
    queryFn: () =>
      getProjectLastTraceAt({
        data: { ...projectScopeData(scope), projectId, filters, ...(searchQuery ? { searchQuery } : {}) },
      }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })

  return { lastTraceAt: data }
}

/**
 * Earliest trace `start_time` (ISO) for the whole project, or null. The concrete "All time" lower
 * bound for analytics screens whose endpoints require one (robust, unlike `project.firstTraceAt`).
 */
export function useProjectFirstTraceAt({
  projectId,
  enabled = true,
}: {
  readonly projectId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const { data = null } = useQuery({
    queryKey: [...projectScopeKey(scope), "traces-first-at", projectId],
    queryFn: () => getProjectFirstTraceAt({ data: { ...projectScopeData(scope), projectId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })

  return { firstTraceAt: data }
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
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "traces-metrics", projectId, filters, searchQuery],
    queryFn: () =>
      getTraceMetricsByProject({
        data: {
          ...projectScopeData(scope),
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
  const scope = useProjectScope()
  return useQuery<CohortSummary>({
    queryKey: [...projectScopeKey(scope), "traces-cohort-summary", projectId],
    queryFn: () =>
      getTraceCohortSummary({
        data: { ...projectScopeData(scope), projectId },
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
  const scope = useProjectScope()
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
        ...projectScopeKey(scope),
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
          ...projectScopeData(scope),
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
  const scope = useProjectScope()
  return useQuery<TraceDistribution>({
    queryKey: [...projectScopeKey(scope), "trace-distribution", projectId, field],
    queryFn: () => getTraceDistribution({ data: { ...projectScopeData(scope), projectId, field } }),
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
  readonly column: "userId" | "tags" | "models" | "providers" | "serviceNames" | "tools" | "definedTools"
  readonly search?: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "trace-distinct", projectId, column, search],
    queryFn: () =>
      getTraceDistinctValues({
        data: { ...projectScopeData(scope), projectId, column, limit: 50, ...(search ? { search } : {}) },
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
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), ...traceDetailQueryKey(projectId, traceId)],
    // getTraceDetail returns `never` at the type level to satisfy TanStack Start's
    // Serialize constraint (see traces.functions.ts); cast back to the actual type
    queryFn: async () => {
      const result = await getTraceDetail({ data: { ...projectScopeData(scope), projectId, traceId } })
      return result as TraceDetailRecord | null
    },
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })
}

export function useTraceConversationMessages({
  projectId,
  traceId,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const query = useInfiniteQuery({
    queryKey: [...projectScopeKey(scope), "traceConversation", projectId, traceId],
    queryFn: async ({ pageParam }): Promise<TraceConversationChunkRecord> => {
      const result = await getTraceConversationChunk({
        data: {
          ...projectScopeData(scope),
          projectId,
          traceId,
          offset: pageParam,
          limit: CONVERSATION_CHUNK_SIZE,
        },
      })
      return result as TraceConversationChunkRecord
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.messages.length : undefined),
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })

  const messages = useMemo(() => query.data?.pages.flatMap((page) => page.messages) ?? [], [query.data])
  // Every chunk carries whole-conversation metadata; page 0 is the stable header.
  const totalMessages = query.data?.pages[0]?.totalMessages ?? 0
  const payloadBytes = query.data?.pages[0]?.payloadBytes ?? 0

  return { ...query, messages, totalMessages, payloadBytes }
}

/** A single span's own conversation (subagent boundary), same contract as useTraceConversationMessages. */
export function useSpanConversationMessages({
  projectId,
  traceId,
  spanId,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly spanId: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const query = useInfiniteQuery({
    queryKey: [...projectScopeKey(scope), "spanConversation", projectId, traceId, spanId],
    queryFn: async ({ pageParam }): Promise<TraceConversationChunkRecord> => {
      const result = await getSpanConversationChunk({
        data: {
          ...projectScopeData(scope),
          projectId,
          traceId,
          spanId,
          offset: pageParam,
          limit: CONVERSATION_CHUNK_SIZE,
        },
      })
      return result as TraceConversationChunkRecord
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.messages.length : undefined),
    enabled: enabled && projectId.length > 0 && traceId.length > 0 && spanId.length > 0,
  })

  const messages = useMemo(() => query.data?.pages.flatMap((page) => page.messages) ?? [], [query.data])
  const totalMessages = query.data?.pages[0]?.totalMessages ?? 0
  const payloadBytes = query.data?.pages[0]?.payloadBytes ?? 0

  return { ...query, messages, totalMessages, payloadBytes }
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
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), ...sessionMomentIntelligenceQueryKey(projectId, sessionId ?? "")],
    queryFn: async (): Promise<readonly SessionMomentIntelligenceRecord[]> =>
      getSessionMomentIntelligence({ data: { ...projectScopeData(scope), projectId, sessionId: sessionId ?? "" } }),
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
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "traceSearchHighlights", projectId, traceId, searchQuery] as const,
    queryFn: async (): Promise<TraceSearchHighlightsResult> => {
      const result = await getTraceSearchHighlights({
        data: { ...projectScopeData(scope), projectId, traceId, searchQuery },
      })
      return result as TraceSearchHighlightsResult
    },
    enabled: enabled && projectId.length > 0 && traceId.length > 0 && searchQuery.length > 0,
    // Deterministic for (traceId, searchQuery); avoid refetch storms on
    // observer remount (drawer close+reopen, tab switch).
    staleTime: 30_000,
  })
}
