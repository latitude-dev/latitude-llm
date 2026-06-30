import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type {
  OrgSignalSearchRecord,
  RelatedSignalRecord,
  SignalDetailRecord,
  SignalDimensionsRecord,
  SignalImpactRecord,
  SignalOccurrenceRecord,
  SignalRecord,
  SignalSessionPageRecord,
  SignalSummaryRecord,
  SignalsListResultRecord,
  UpdateSignalTriageRecord,
} from "./signals.functions.ts"
import {
  countSignalSessions,
  getRelatedSignals,
  getSignal,
  getSignalDetail,
  getSignalDimensions,
  getSignalImpact,
  getSignalOccurrences,
  listSignalSessions,
  listSignals,
  searchOrgSignals,
  updateSignalTriage,
} from "./signals.functions.ts"

const queryClient = getQueryClient()
const DEFAULT_SIGNALS_BATCH_SIZE = 50
const SIGNAL_TRACE_BATCH_SIZE = 25
const SIGNALS_QUERY_STALE_TIME_MS = 30_000
const EMPTY_SIGNALS_ANALYTICS: SignalsListResultRecord["analytics"] = {
  counts: {
    newSignals: 0,
    escalatingSignals: 0,
    ongoingSignals: 0,
    seenOccurrences: 0,
  },
  histogram: [],
  histogramBucketSeconds: 24 * 60 * 60,
  totalSessions: 0,
}
const EMPTY_PRIORITY_COUNTS: SignalsListResultRecord["priorityCounts"] = {
  urgent: 0,
  high: 0,
  medium: 0,
  low: 0,
  none: 0,
}
const DEFAULT_SIGNALS_SORTING = {
  column: "lastSeen",
  direction: "desc",
} as const satisfies SignalsSorting

interface SignalsSorting {
  readonly column: "lastSeen" | "occurrences" | "affectedSessions" | "state"
  readonly direction: "asc" | "desc"
}

interface SignalsTimeRange {
  readonly fromIso?: string
  readonly toIso?: string
}

interface SignalsKeyInput {
  readonly projectId: string
  readonly limit: number
  readonly lifecycleGroup: "active" | "archived" | undefined
  readonly assigneeIds: readonly string[] | undefined
  readonly sorting: SignalsSorting
  readonly searchQuery: string | undefined
  readonly timeRange: SignalsTimeRange | undefined
}

const getSignalsQueryKey = (input: SignalsKeyInput) =>
  [
    "signals",
    input.projectId,
    input.limit,
    input.lifecycleGroup ?? null,
    input.assigneeIds?.length ? [...input.assigneeIds].sort().join(",") : null,
    input.sorting.column,
    input.sorting.direction,
    input.searchQuery ?? null,
    input.timeRange?.fromIso ?? null,
    input.timeRange?.toIso ?? null,
  ] as const

const getSignalsOffsetQueryKey = (input: SignalsKeyInput, offset: number) =>
  [...getSignalsQueryKey(input), "offset", offset] as const

const getSignalQueryKey = (projectId: string, signalId: string) => ["signal", projectId, signalId] as const

const getSignalDetailQueryKey = (projectId: string, signalId: string) => ["signal-detail", projectId, signalId] as const

const getSignalImpactQueryKey = (projectId: string, signalId: string) => ["signal-impact", projectId, signalId] as const

const getSignalDimensionsQueryKey = (projectId: string, signalId: string, dimension: string) =>
  ["signal-dimensions", projectId, signalId, dimension] as const

const getSignalOccurrencesQueryKey = (projectId: string, signalId: string) =>
  ["signal-occurrences", projectId, signalId] as const

const getRelatedSignalsQueryKey = (projectId: string, signalId: string) =>
  ["related-signals", projectId, signalId] as const

const getSignalSessionsQueryKey = (projectId: string, signalId: string) =>
  ["signal-sessions", projectId, signalId] as const

const getSignalSessionsPageKey = (projectId: string, signalId: string, offset: number) =>
  ["signal-sessions-page", projectId, signalId, offset] as const

const getSignalSessionsCountQueryKey = (projectId: string, signalId: string) =>
  ["signal-sessions-count", projectId, signalId] as const

const buildListSignalsRequest = (input: SignalsKeyInput, offset: number) => ({
  projectId: input.projectId,
  limit: input.limit,
  offset,
  sort: {
    field: input.sorting.column,
    direction: input.sorting.direction,
  },
  ...(input.lifecycleGroup ? { lifecycleGroup: input.lifecycleGroup } : {}),
  ...(input.assigneeIds?.length ? { assigneeIds: [...input.assigneeIds] } : {}),
  ...(input.searchQuery ? { searchQuery: input.searchQuery } : {}),
  ...(input.timeRange?.fromIso || input.timeRange?.toIso ? { timeRange: input.timeRange } : {}),
})

export function useSignals(input: {
  readonly projectId: string
  readonly lifecycleGroup?: "active" | "archived"
  readonly assigneeIds?: readonly string[]
  readonly sorting?: SignalsSorting
  readonly searchQuery?: string
  readonly timeRange?: SignalsTimeRange
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const normalizedSearchQuery = input.searchQuery?.trim() || undefined
  const sorting = input.sorting ?? DEFAULT_SIGNALS_SORTING
  const limit = input.limit ?? DEFAULT_SIGNALS_BATCH_SIZE
  const keyInput: SignalsKeyInput = {
    projectId: input.projectId,
    limit,
    lifecycleGroup: input.lifecycleGroup,
    assigneeIds: input.assigneeIds?.length ? input.assigneeIds : undefined,
    sorting,
    searchQuery: normalizedSearchQuery,
    timeRange: input.timeRange,
  }

  const queryKey = useMemo(
    () => getSignalsQueryKey(keyInput),
    [
      keyInput.projectId,
      keyInput.limit,
      keyInput.lifecycleGroup,
      keyInput.assigneeIds,
      keyInput.sorting.column,
      keyInput.sorting.direction,
      keyInput.searchQuery,
      keyInput.timeRange?.fromIso,
      keyInput.timeRange?.toIso,
    ],
  )

  const fetchPage = async (offset: number): Promise<SignalsListResultRecord> => {
    const offsetKey = getSignalsOffsetQueryKey(keyInput, offset)
    return queryClient.fetchQuery({
      queryKey: offsetKey,
      queryFn: () =>
        listSignals({
          data: buildListSignalsRequest(keyInput, offset),
        }),
      staleTime: SIGNALS_QUERY_STALE_TIME_MS,
    })
  }

  const enabled = (input.enabled ?? true) && input.projectId.length > 0

  const {
    data: paginatedData,
    isLoading,
    isPlaceholderData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage ?? false,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const pages = paginatedData?.pages ?? []
  const firstPage = pages[0]
  const latestPage = pages.at(-1) ?? firstPage

  return {
    data: useMemo(() => pages.flatMap((page) => page.items), [pages]) as readonly SignalRecord[],
    analytics: latestPage?.analytics ?? EMPTY_SIGNALS_ANALYTICS,
    totalCount: firstPage?.totalCount ?? 0,
    hasAnySignals: firstPage?.hasAnySignals ?? false,
    hasMore: latestPage?.hasMore ?? false,
    limit: firstPage?.limit ?? limit,
    offset: latestPage?.offset ?? 0,
    occurrencesSum: latestPage?.occurrencesSum ?? 0,
    priorityCounts: latestPage?.priorityCounts ?? EMPTY_PRIORITY_COUNTS,
    mySignalsCount: latestPage?.mySignalsCount ?? 0,
    infiniteScroll,
    isLoading,
    isReloading: isPlaceholderData && !isLoading,
    isAnalyticsLoading: isLoading,
  }
}

export function useSignalsOrgSearch(input: {
  readonly query: string
  readonly semantic?: boolean
  readonly preferProjectId?: string
  readonly enabled?: boolean
}) {
  const normalizedQuery = input.query.trim()
  return useQuery({
    queryKey: ["signals", "orgSearch", normalizedQuery, input.semantic ?? false, input.preferProjectId ?? null],
    queryFn: (): Promise<readonly OrgSignalSearchRecord[]> =>
      searchOrgSignals({
        data: {
          searchQuery: normalizedQuery,
          semantic: input.semantic ?? false,
          ...(input.preferProjectId ? { preferProjectId: input.preferProjectId } : {}),
        },
      }),
    enabled: (input.enabled ?? true) && normalizedQuery.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useSignalDetail(input: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalDetailQueryKey(input.projectId, input.signalId),
    queryFn: (): Promise<SignalDetailRecord | null> =>
      getSignalDetail({ data: { projectId: input.projectId, signalId: input.signalId } }),
    enabled: (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useSignal(input: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalQueryKey(input.projectId, input.signalId),
    queryFn: (): Promise<SignalSummaryRecord | null> =>
      getSignal({ data: { projectId: input.projectId, signalId: input.signalId } }),
    enabled: (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useSignalImpact(input: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalImpactQueryKey(input.projectId, input.signalId),
    queryFn: (): Promise<SignalImpactRecord> =>
      getSignalImpact({ data: { projectId: input.projectId, signalId: input.signalId } }),
    enabled: (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useSignalDimensions(input: {
  readonly projectId: string
  readonly signalId: string
  readonly dimension: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalDimensionsQueryKey(input.projectId, input.signalId, input.dimension),
    queryFn: (): Promise<SignalDimensionsRecord> =>
      getSignalDimensions({
        data: { projectId: input.projectId, signalId: input.signalId, dimension: input.dimension as never },
      }),
    enabled: (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useRelatedSignals(input: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getRelatedSignalsQueryKey(input.projectId, input.signalId),
    queryFn: (): Promise<readonly RelatedSignalRecord[]> =>
      getRelatedSignals({ data: { projectId: input.projectId, signalId: input.signalId } }),
    enabled: (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useSignalOccurrences(input: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalOccurrencesQueryKey(input.projectId, input.signalId),
    queryFn: (): Promise<{ readonly items: readonly SignalOccurrenceRecord[] }> =>
      getSignalOccurrences({ data: { projectId: input.projectId, signalId: input.signalId } }),
    enabled: (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useSignalSessionsInfiniteScroll(input: {
  readonly projectId: string
  readonly signalId: string
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const limit = input.limit ?? SIGNAL_TRACE_BATCH_SIZE
  const baseKey = getSignalSessionsQueryKey(input.projectId, input.signalId)
  const enabled = (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0

  const fetchPage = async (offset: number): Promise<SignalSessionPageRecord> =>
    queryClient.fetchQuery({
      queryKey: getSignalSessionsPageKey(input.projectId, input.signalId, offset),
      queryFn: () =>
        listSignalSessions({
          data: { projectId: input.projectId, signalId: input.signalId, limit, offset },
        }),
      staleTime: SIGNALS_QUERY_STALE_TIME_MS,
    })

  const query = useInfiniteQuery({
    queryKey: [...baseKey, limit],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
    enabled,
  })

  return {
    ...query,
    data: useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data?.pages]),
    infiniteScroll: useMemo(
      () => ({
        hasMore: query.hasNextPage ?? false,
        isLoadingMore: query.isFetchingNextPage,
        onLoadMore: query.fetchNextPage,
      }),
      [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage],
    ),
  }
}

export function useSignalSessionsCount(input: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalSessionsCountQueryKey(input.projectId, input.signalId),
    queryFn: (): Promise<number> =>
      countSignalSessions({ data: { projectId: input.projectId, signalId: input.signalId } }),
    enabled: (input.enabled ?? true) && input.projectId.length > 0 && input.signalId.length > 0,
    staleTime: SIGNALS_QUERY_STALE_TIME_MS,
  })
}

export function useUpdateSignalTriage(projectId: string, signalId: string) {
  const mutation = useMutation({
    mutationFn: (input: {
      readonly assigneeId?: string | null
      readonly priority?: "low" | "medium" | "high" | "urgent" | null
    }): Promise<UpdateSignalTriageRecord> => updateSignalTriage({ data: { projectId, signalId, ...input } }),
    onSuccess: () => {
      invalidateSignalQueries(projectId, signalId)
    },
  })

  return mutation
}

export function invalidateSignalQueries(projectId: string, signalId?: string) {
  void queryClient.invalidateQueries({ queryKey: ["signals", projectId] })
  if (signalId) {
    void queryClient.invalidateQueries({ queryKey: getSignalQueryKey(projectId, signalId) })
    void queryClient.invalidateQueries({ queryKey: getSignalDetailQueryKey(projectId, signalId) })
    void queryClient.invalidateQueries({ queryKey: getSignalImpactQueryKey(projectId, signalId) })
    void queryClient.invalidateQueries({ queryKey: ["signal-dimensions", projectId, signalId] })
    void queryClient.invalidateQueries({ queryKey: getSignalOccurrencesQueryKey(projectId, signalId) })
    void queryClient.invalidateQueries({ queryKey: getRelatedSignalsQueryKey(projectId, signalId) })
    void queryClient.invalidateQueries({ queryKey: getSignalSessionsQueryKey(projectId, signalId) })
    void queryClient.invalidateQueries({ queryKey: getSignalSessionsCountQueryKey(projectId, signalId) })
  }
}
