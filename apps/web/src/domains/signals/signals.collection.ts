import type { SignalDimension } from "@domain/scores"
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
  SignalSummaryRecord,
  SignalsListResultRecord,
  SignalTracePageRecord,
  SignalTraceRecord,
  UpdateSignalTriageRecord,
} from "./signals.functions.ts"
import {
  countSignalTraces,
  getRelatedSignals,
  getSignal,
  getSignalDetail,
  getSignalDimensions,
  getSignalImpact,
  getSignalOccurrences,
  listSignals,
  listSignalTraces,
  searchOrgSignals,
  updateSignalTriage,
} from "./signals.functions.ts"

const queryClient = getQueryClient()
const DEFAULT_ISSUES_BATCH_SIZE = 50
const SIGNAL_TRACE_BATCH_SIZE = 25
const ISSUES_QUERY_STALE_TIME_MS = 30_000
const EMPTY_ISSUES_ANALYTICS: SignalsListResultRecord["analytics"] = {
  counts: {
    newSignals: 0,
    escalatingSignals: 0,
    ongoingSignals: 0,
    regressedSignals: 0,
    resolvedSignals: 0,
    seenOccurrences: 0,
  },
  histogram: [],
  histogramBucketSeconds: 24 * 60 * 60,
  totalTraces: 0,
}
const EMPTY_PRIORITY_COUNTS: SignalsListResultRecord["priorityCounts"] = {
  urgent: 0,
  high: 0,
  medium: 0,
  low: 0,
  none: 0,
}
const DEFAULT_ISSUES_SORTING = {
  column: "lastSeen",
  direction: "desc",
} as const satisfies SignalsSorting

interface SignalsSorting {
  readonly column: "lastSeen" | "occurrences" | "state"
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
    "issues",
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

const getSignalQueryKey = (projectId: string, signalId: string) => ["issue", projectId, signalId] as const

const getSignalDetailQueryKey = (projectId: string, signalId: string) => ["issue-detail", projectId, signalId] as const

const getSignalImpactQueryKey = (projectId: string, signalId: string) => ["issue-impact", projectId, signalId] as const

const getSignalDimensionsQueryKey = (projectId: string, signalId: string, dimension: SignalDimension) =>
  ["issue-dimensions", projectId, signalId, dimension] as const

const getSignalOccurrencesQueryKey = (projectId: string, signalId: string) =>
  ["issue-occurrences", projectId, signalId] as const

const getRelatedSignalsQueryKey = (projectId: string, signalId: string) =>
  ["related-issues", projectId, signalId] as const

const getSignalTracesQueryKey = (projectId: string, signalId: string) => ["issue-traces", projectId, signalId] as const

const getSignalTracesPageKey = (projectId: string, signalId: string, offset: number) =>
  ["issue-traces-page", projectId, signalId, offset] as const

const getSignalTracesCountQueryKey = (projectId: string, signalId: string) =>
  ["issue-traces-count", projectId, signalId] as const

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
  const sorting = input.sorting ?? DEFAULT_ISSUES_SORTING
  const limit = input.limit ?? DEFAULT_ISSUES_BATCH_SIZE
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
    // Use the per-page query cache, but still refetch when invalidated instead of
    // short-circuiting to stale data via getQueryData().
    const result = await queryClient.fetchQuery({
      queryKey: offsetKey,
      queryFn: () =>
        listSignals({
          data: buildListSignalsRequest(keyInput, offset),
        }),
      staleTime: ISSUES_QUERY_STALE_TIME_MS,
    })

    if (result.hasMore) {
      const nextOffset = result.offset + result.limit
      void queryClient.prefetchQuery({
        queryKey: getSignalsOffsetQueryKey(keyInput, nextOffset),
        queryFn: () =>
          listSignals({
            data: buildListSignalsRequest(keyInput, nextOffset),
          }),
        staleTime: ISSUES_QUERY_STALE_TIME_MS,
      })
    }

    return result
  }

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
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: (input.enabled ?? true) && input.projectId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage ?? false,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const data = useMemo(() => paginatedData?.pages.flatMap((page) => page.items) ?? [], [paginatedData])
  const firstPage = paginatedData?.pages[0]

  return {
    data: data as readonly SignalRecord[],
    analytics: firstPage?.analytics ?? EMPTY_ISSUES_ANALYTICS,
    totalCount: firstPage?.totalCount ?? 0,
    hasAnySignals: firstPage?.hasAnySignals ?? false,
    occurrencesSum: firstPage?.occurrencesSum ?? 0,
    priorityCounts: firstPage?.priorityCounts ?? EMPTY_PRIORITY_COUNTS,
    mySignalsCount: firstPage?.mySignalsCount ?? 0,
    isLoading,
    // True while a new query key is in flight and the previous result is being
    // shown as placeholder (e.g. after a sort/filter change). Lets consumers
    // surface skeleton states without unmounting the surrounding page layout.
    isReloading: isPlaceholderData,
    infiniteScroll,
  }
}

const ORG_SEARCH_LIMIT = 10

/**
 * Org-wide issue search for the Command Palette. One tier per call: pass `semantic: false` for the
 * instant lexical tier and `semantic: true` for the debounced semantic tier. Results span every
 * project in the organization, each carrying its owning project's slug/name and derived states.
 * Resolved/ignored issues are excluded so the palette recommends active issues only.
 * `preferProjectId` (the current project, when inside one) ranks that project's issues first.
 */
export function useSignalsOrgSearch(
  searchQuery: string,
  {
    semantic = false,
    enabled = true,
    preferProjectId,
  }: { readonly semantic?: boolean; readonly enabled?: boolean; readonly preferProjectId?: string | undefined } = {},
) {
  const trimmed = searchQuery.trim()
  const { data, isLoading } = useQuery({
    queryKey: ["issues", "orgSearch", trimmed, semantic, preferProjectId ?? null],
    queryFn: (): Promise<readonly OrgSignalSearchRecord[]> =>
      searchOrgSignals({
        data: {
          searchQuery: trimmed,
          semantic,
          limit: ORG_SEARCH_LIMIT,
          ...(preferProjectId ? { preferProjectId } : {}),
        },
      }),
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
    enabled: enabled && trimmed.length > 0,
  })
  return { data: data ?? [], isLoading }
}

export function useSignalDetail({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalDetailQueryKey(projectId, signalId),
    queryFn: (): Promise<SignalDetailRecord | null> => getSignalDetail({ data: { projectId, signalId } }),
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
  })
}

export function useSignal({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalQueryKey(projectId, signalId),
    queryFn: (): Promise<SignalSummaryRecord | null> => getSignal({ data: { projectId, signalId } }),
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
  })
}

export function useSignalImpact({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalImpactQueryKey(projectId, signalId),
    queryFn: (): Promise<SignalImpactRecord> => getSignalImpact({ data: { projectId, signalId } }),
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

export function useSignalDimensions({
  projectId,
  signalId,
  dimension,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly dimension: SignalDimension
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalDimensionsQueryKey(projectId, signalId, dimension),
    queryFn: (): Promise<SignalDimensionsRecord> => getSignalDimensions({ data: { projectId, signalId, dimension } }),
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

export function useRelatedSignals({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getRelatedSignalsQueryKey(projectId, signalId),
    queryFn: (): Promise<readonly RelatedSignalRecord[]> => getRelatedSignals({ data: { projectId, signalId } }),
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

export function useSignalOccurrences({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getSignalOccurrencesQueryKey(projectId, signalId),
    queryFn: (): Promise<{ readonly items: readonly SignalOccurrenceRecord[] }> =>
      getSignalOccurrences({ data: { projectId, signalId } }),
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

/**
 * Mutation for the light-triage fields (assignee, priority). Omit a field to
 * leave it unchanged; pass `null` to clear it. Invalidates the issue detail
 * queries AND the issues list on success — the list groups by priority and
 * filters/counts by assignee, so triage edits must regroup it.
 */
export function useUpdateSignalTriage(projectId: string, signalId: string) {
  return useMutation({
    mutationFn: (input: {
      readonly assigneeId?: string | null
      readonly priority?: UpdateSignalTriageRecord["priority"]
    }): Promise<UpdateSignalTriageRecord> =>
      updateSignalTriage({
        data: {
          projectId,
          signalId,
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
      }),
    onSuccess: () => invalidateSignalQueries(projectId, signalId),
  })
}

export function useSignalTracesInfiniteScroll({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: getSignalTracesQueryKey(projectId, signalId),
    queryFn: async ({ pageParam }): Promise<SignalTracePageRecord> => {
      const pageKey = getSignalTracesPageKey(projectId, signalId, pageParam)
      const result = await queryClient.fetchQuery({
        queryKey: pageKey,
        queryFn: () =>
          listSignalTraces({
            data: {
              projectId,
              signalId,
              limit: SIGNAL_TRACE_BATCH_SIZE,
              offset: pageParam,
            },
          }),
        staleTime: ISSUES_QUERY_STALE_TIME_MS,
      })

      if (result.hasMore) {
        const nextOffset = result.offset + result.limit
        void queryClient.prefetchQuery({
          queryKey: getSignalTracesPageKey(projectId, signalId, nextOffset),
          queryFn: () =>
            listSignalTraces({
              data: {
                projectId,
                signalId,
                limit: SIGNAL_TRACE_BATCH_SIZE,
                offset: nextOffset,
              },
            }),
          staleTime: ISSUES_QUERY_STALE_TIME_MS,
        })
      }

      return result
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage ?? false,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const data: readonly SignalTraceRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((page) => page.items) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}

export function useSignalTracesCount({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  const { data } = useQuery({
    queryKey: getSignalTracesCountQueryKey(projectId, signalId),
    queryFn: () => countSignalTraces({ data: { projectId, signalId } }),
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })

  return data?.total ?? 0
}

const invalidateSignalDetailQueries = (projectId: string, signalId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: getSignalQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: getSignalDetailQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: getSignalImpactQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: getSignalTracesQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: ["issue-traces-page", projectId, signalId] }),
    queryClient.invalidateQueries({ queryKey: getSignalTracesCountQueryKey(projectId, signalId) }),
  ])

export const invalidateSignalQueries = (projectId: string, signalId?: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
    ...(signalId ? [invalidateSignalDetailQueries(projectId, signalId)] : []),
  ])
