import type { SignalPreviewResult } from "@domain/evaluations"
import type { SignalDimension } from "@domain/scores"
import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery } from "@tanstack/react-query"
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
  SignalRowMetricsRecord,
  SignalSessionPageRecord,
  SignalSummaryRecord,
  SignalsListResultRecord,
  UpdateSignalTriageRecord,
} from "./signals.functions.ts"
import {
  type CreateSignalRecord,
  countSignalSessions,
  createSignal,
  deleteSignal,
  getRelatedSignals,
  getSignal,
  getSignalDetail,
  getSignalDimensions,
  getSignalImpact,
  getSignalOccurrences,
  getSignalPreviewResult,
  getSignalRowMetrics,
  getSignalsAnalytics,
  listSignalSessions,
  listSignals,
  previewEvaluation,
  searchOrgSignals,
  updateSignal,
  updateSignalEvaluation,
  updateSignalTriage,
} from "./signals.functions.ts"

type EvaluationDraft = Parameters<typeof createSignal>[0]["data"]["evaluation"]
type SignalFilters = NonNullable<Parameters<typeof createSignal>[0]["data"]["filters"]>

const queryClient = getQueryClient()
const DEFAULT_ISSUES_BATCH_SIZE = 50
const SIGNAL_TRACE_BATCH_SIZE = 25
const ISSUES_QUERY_STALE_TIME_MS = 30_000
const EMPTY_ISSUES_ANALYTICS: SignalsListResultRecord["analytics"] = {
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
const DEFAULT_ISSUES_SORTING = {
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

const getSignalsAnalyticsQueryKey = (input: SignalsKeyInput) => [...getSignalsQueryKey(input), "analytics"] as const

const getSignalRowMetricsQueryKey = (input: SignalsKeyInput, offset: number, signalIds: readonly string[]) =>
  [...getSignalsQueryKey(input), "rowMetrics", offset, signalIds.join(",")] as const

const getSignalQueryKey = (projectId: string, signalId: string) => ["issue", projectId, signalId] as const

const getSignalDetailQueryKey = (projectId: string, signalId: string) => ["issue-detail", projectId, signalId] as const

const getSignalImpactQueryKey = (projectId: string, signalId: string) => ["issue-impact", projectId, signalId] as const

const getSignalDimensionsQueryKey = (projectId: string, signalId: string, dimension: SignalDimension) =>
  ["issue-dimensions", projectId, signalId, dimension] as const

const getSignalOccurrencesQueryKey = (projectId: string, signalId: string) =>
  ["issue-occurrences", projectId, signalId] as const

const getRelatedSignalsQueryKey = (projectId: string, signalId: string) =>
  ["related-signals", projectId, signalId] as const

const getSignalSessionsQueryKey = (projectId: string, signalId: string) =>
  ["issue-sessions", projectId, signalId] as const

const getSignalSessionsPageKey = (projectId: string, signalId: string, offset: number) =>
  ["issue-sessions-page", projectId, signalId, offset] as const

const getSignalSessionsCountQueryKey = (projectId: string, signalId: string) =>
  ["issue-sessions-count", projectId, signalId] as const

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

    return result
  }

  const enabled = (input.enabled ?? true) && input.projectId.length > 0
  const analyticsQuery = useQuery({
    queryKey: getSignalsAnalyticsQueryKey(keyInput),
    queryFn: (): Promise<SignalsListResultRecord> =>
      getSignalsAnalytics({
        data: buildListSignalsRequest(keyInput, 0),
      }),
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled,
  })

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
  const rowMetricsQueries = useQueries({
    queries: pages.flatMap((page) => {
      const signalIds = page.items.map((issue) => issue.id)
      if (signalIds.length === 0) return []
      return [
        {
          queryKey: getSignalRowMetricsQueryKey(keyInput, page.offset, signalIds),
          queryFn: (): Promise<SignalRowMetricsRecord> =>
            getSignalRowMetrics({
              data: {
                projectId: keyInput.projectId,
                signalIds,
                ...(keyInput.timeRange ? { timeRange: keyInput.timeRange } : {}),
              },
            }),
          staleTime: ISSUES_QUERY_STALE_TIME_MS,
          enabled,
        },
      ]
    }),
  })

  // Dedupe by id: offset pagination over a live, re-sorted set can return the
  // same signal in adjacent pages, which would otherwise yield duplicate React
  // keys and repeated rows. Earlier page wins to keep the top-of-list order.
  const data = useMemo(() => {
    const seen = new Set<string>()
    const deduped: SignalRecord[] = []
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        deduped.push(item)
      }
    }
    return deduped
  }, [pages])
  const rowMetricsBySignalId = useMemo(
    () =>
      Object.assign(
        {},
        ...rowMetricsQueries.map((query) => query.data?.metricsBySignalId ?? {}),
      ) as SignalRowMetricsRecord["metricsBySignalId"],
    [rowMetricsQueries],
  )
  const firstPage = paginatedData?.pages[0]
  const analyticsPage = analyticsQuery.data

  return {
    data: data as readonly SignalRecord[],
    rowMetricsBySignalId,
    analytics: analyticsPage?.analytics ?? EMPTY_ISSUES_ANALYTICS,
    totalCount: firstPage?.totalCount ?? 0,
    hasAnySignals: firstPage?.hasAnySignals ?? false,
    occurrencesSum: analyticsPage?.occurrencesSum ?? 0,
    priorityCounts: analyticsPage?.priorityCounts ?? EMPTY_PRIORITY_COUNTS,
    mySignalsCount: analyticsPage?.mySignalsCount ?? 0,
    isLoading,
    // True while a new query key is in flight and the previous result is being
    // shown as placeholder (e.g. after a sort/filter change). Lets consumers
    // surface skeleton states without unmounting the surrounding page layout.
    isReloading: isPlaceholderData,
    isAnalyticsLoading: analyticsQuery.isLoading || analyticsQuery.isPlaceholderData,
    infiniteScroll,
  }
}

const ORG_SEARCH_LIMIT = 10

/**
 * Org-wide issue search for the Command Palette. One tier per call: pass `semantic: false` for the
 * instant lexical tier and `semantic: true` for the debounced semantic tier. Results span every
 * project in the organization, each carrying its owning project's slug/name and derived states.
 * Muted issues are excluded so the palette recommends active issues only.
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

export function useCreateSignal(projectId: string) {
  return useMutation({
    mutationFn: (input: {
      readonly name: string
      readonly description: string
      readonly filters?: SignalFilters | null
      readonly sampling?: number
      readonly evaluation: EvaluationDraft
    }): Promise<CreateSignalRecord> =>
      createSignal({
        data: {
          projectId,
          name: input.name,
          description: input.description,
          ...(input.filters != null ? { filters: input.filters } : {}),
          ...(input.sampling !== undefined ? { sampling: input.sampling } : {}),
          evaluation: input.evaluation,
        },
      }),
    onSuccess: () => invalidateSignalQueries(projectId),
  })
}

export function useUpdateSignal(projectId: string, signalId: string) {
  return useMutation({
    mutationFn: (input: {
      readonly name?: string
      readonly description?: string
      readonly filters?: SignalFilters | null
    }) =>
      updateSignal({
        data: {
          projectId,
          signalId,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.filters !== undefined ? { filters: input.filters } : {}),
        },
      }),
    onSuccess: () => invalidateSignalQueries(projectId, signalId),
  })
}

export function useUpdateSignalEvaluation(projectId: string, signalId: string) {
  return useMutation({
    mutationFn: (input: { readonly evaluation: EvaluationDraft; readonly sampling?: number }) =>
      updateSignalEvaluation({
        data: {
          projectId,
          signalId,
          evaluation: input.evaluation,
          ...(input.sampling !== undefined ? { sampling: input.sampling } : {}),
        },
      }),
    onSuccess: () => invalidateSignalQueries(projectId, signalId),
  })
}

export function useDeleteSignal(projectId: string) {
  return useMutation({
    mutationFn: (signalId: string) => deleteSignal({ data: { projectId, signalId } }),
    onSuccess: () => invalidateSignalQueries(projectId),
  })
}

const PREVIEW_POLL_INTERVAL_MS = 800
const PREVIEW_POLL_TIMEOUT_MS = 30_000

/**
 * Enqueues a builder preview run and polls until the worker writes a result (or the timeout
 * elapses). Used by the builder's on-demand "Run preview" action — not a reactive query.
 */
export async function runSignalPreview(input: {
  readonly projectId: string
  readonly evaluation: EvaluationDraft
  readonly filters?: SignalFilters | null
  /** Stops polling early when the caller (e.g. a closing modal) is no longer interested. */
  readonly signal?: AbortSignal
}): Promise<SignalPreviewResult> {
  const { previewId } = await previewEvaluation({
    data: {
      projectId: input.projectId,
      evaluation: input.evaluation,
      ...(input.filters != null ? { filters: input.filters } : {}),
    },
  })

  const deadline = Date.now() + PREVIEW_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (input.signal?.aborted) return { status: "error", error: "Preview cancelled" }
    const result = await getSignalPreviewResult({ data: { previewId } })
    if (result.status !== "pending") return result
    await new Promise((resolve) => setTimeout(resolve, PREVIEW_POLL_INTERVAL_MS))
  }
  return { status: "error", error: "Preview timed out" }
}

export function useSignalSessionsCount({
  projectId,
  signalId,
  enabled = true,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly enabled?: boolean
}) {
  const { data } = useQuery({
    queryKey: getSignalSessionsCountQueryKey(projectId, signalId),
    queryFn: () => countSignalSessions({ data: { projectId, signalId } }),
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0 && signalId.length > 0,
  })
  return data ?? 0
}

export function useSignalSessionsInfiniteScroll({
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
    queryKey: getSignalSessionsQueryKey(projectId, signalId),
    queryFn: async ({ pageParam }): Promise<SignalSessionPageRecord> => {
      const pageKey = getSignalSessionsPageKey(projectId, signalId, pageParam)
      const result = await queryClient.fetchQuery({
        queryKey: pageKey,
        queryFn: () =>
          listSignalSessions({
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
          queryKey: getSignalSessionsPageKey(projectId, signalId, nextOffset),
          queryFn: () =>
            listSignalSessions({
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

  const data = useMemo(() => paginatedData?.pages.flatMap((page) => page.items) ?? [], [paginatedData])

  return { data, isLoading, infiniteScroll }
}

const invalidateSignalDetailQueries = (projectId: string, signalId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: getSignalQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: getSignalDetailQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: getSignalImpactQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: getSignalSessionsQueryKey(projectId, signalId) }),
    queryClient.invalidateQueries({ queryKey: ["issue-sessions-page", projectId, signalId] }),
    queryClient.invalidateQueries({ queryKey: getSignalSessionsCountQueryKey(projectId, signalId) }),
  ])

export const invalidateSignalQueries = (projectId: string, signalId?: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
    ...(signalId ? [invalidateSignalDetailQueries(projectId, signalId)] : []),
  ])
