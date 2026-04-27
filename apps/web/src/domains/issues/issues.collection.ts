import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type {
  IssueDetailRecord,
  IssueRecord,
  IssueSummaryRecord,
  IssuesListResultRecord,
  IssueTracePageRecord,
  IssueTraceRecord,
} from "./issues.functions.ts"
import { getIssue, getIssueDetail, listIssues, listIssueTraces } from "./issues.functions.ts"

const queryClient = getQueryClient()
const DEFAULT_ISSUES_BATCH_SIZE = 50
const ISSUE_TRACE_BATCH_SIZE = 25
const ISSUES_QUERY_STALE_TIME_MS = 30_000
const EMPTY_ISSUES_ANALYTICS: IssuesListResultRecord["analytics"] = {
  counts: {
    newIssues: 0,
    escalatingIssues: 0,
    ongoingIssues: 0,
    regressedIssues: 0,
    resolvedIssues: 0,
    seenOccurrences: 0,
  },
  histogram: [],
  totalTraces: 0,
}
const DEFAULT_ISSUES_SORTING = {
  column: "lastSeen",
  direction: "desc",
} as const satisfies IssuesSorting

interface IssuesSorting {
  readonly column: "lastSeen" | "occurrences" | "state"
  readonly direction: "asc" | "desc"
}

interface IssuesTimeRange {
  readonly fromIso?: string
  readonly toIso?: string
}

interface IssuesKeyInput {
  readonly projectId: string
  readonly limit: number
  readonly lifecycleGroup: "active" | "archived" | undefined
  readonly sorting: IssuesSorting
  readonly searchQuery: string | undefined
  readonly timeRange: IssuesTimeRange | undefined
}

const getIssuesQueryKey = (input: IssuesKeyInput) =>
  [
    "issues",
    input.projectId,
    input.limit,
    input.lifecycleGroup ?? null,
    input.sorting.column,
    input.sorting.direction,
    input.searchQuery ?? null,
    input.timeRange?.fromIso ?? null,
    input.timeRange?.toIso ?? null,
  ] as const

const getIssuesOffsetQueryKey = (input: IssuesKeyInput, offset: number) =>
  [...getIssuesQueryKey(input), "offset", offset] as const

const getIssueQueryKey = (projectId: string, issueId: string) => ["issue", projectId, issueId] as const

const getIssueDetailQueryKey = (projectId: string, issueId: string) => ["issue-detail", projectId, issueId] as const

const getIssueTracesQueryKey = (projectId: string, issueId: string) => ["issue-traces", projectId, issueId] as const

const getIssueTracesPageKey = (projectId: string, issueId: string, offset: number) =>
  ["issue-traces-page", projectId, issueId, offset] as const

const buildListIssuesRequest = (input: IssuesKeyInput, offset: number) => ({
  projectId: input.projectId,
  limit: input.limit,
  offset,
  sort: {
    field: input.sorting.column,
    direction: input.sorting.direction,
  },
  ...(input.lifecycleGroup ? { lifecycleGroup: input.lifecycleGroup } : {}),
  ...(input.searchQuery ? { searchQuery: input.searchQuery } : {}),
  ...(input.timeRange?.fromIso || input.timeRange?.toIso ? { timeRange: input.timeRange } : {}),
})

export function useIssues(input: {
  readonly projectId: string
  readonly lifecycleGroup?: "active" | "archived"
  readonly sorting?: IssuesSorting
  readonly searchQuery?: string
  readonly timeRange?: IssuesTimeRange
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const normalizedSearchQuery = input.searchQuery?.trim() || undefined
  const sorting = input.sorting ?? DEFAULT_ISSUES_SORTING
  const limit = input.limit ?? DEFAULT_ISSUES_BATCH_SIZE
  const keyInput: IssuesKeyInput = {
    projectId: input.projectId,
    limit,
    lifecycleGroup: input.lifecycleGroup,
    sorting,
    searchQuery: normalizedSearchQuery,
    timeRange: input.timeRange,
  }

  const queryKey = useMemo(
    () => getIssuesQueryKey(keyInput),
    [
      keyInput.projectId,
      keyInput.limit,
      keyInput.lifecycleGroup,
      keyInput.sorting.column,
      keyInput.sorting.direction,
      keyInput.searchQuery,
      keyInput.timeRange?.fromIso,
      keyInput.timeRange?.toIso,
    ],
  )

  const fetchPage = async (offset: number): Promise<IssuesListResultRecord> => {
    const offsetKey = getIssuesOffsetQueryKey(keyInput, offset)
    // Use the per-page query cache, but still refetch when invalidated instead of
    // short-circuiting to stale data via getQueryData().
    const result = await queryClient.fetchQuery({
      queryKey: offsetKey,
      queryFn: () =>
        listIssues({
          data: buildListIssuesRequest(keyInput, offset),
        }),
      staleTime: ISSUES_QUERY_STALE_TIME_MS,
    })

    if (result.hasMore) {
      const nextOffset = result.offset + result.limit
      void queryClient.prefetchQuery({
        queryKey: getIssuesOffsetQueryKey(keyInput, nextOffset),
        queryFn: () =>
          listIssues({
            data: buildListIssuesRequest(keyInput, nextOffset),
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
    data: data as readonly IssueRecord[],
    analytics: firstPage?.analytics ?? EMPTY_ISSUES_ANALYTICS,
    totalCount: firstPage?.totalCount ?? 0,
    occurrencesSum: firstPage?.occurrencesSum ?? 0,
    isLoading,
    // True while a new query key is in flight and the previous result is being
    // shown as placeholder (e.g. after a sort/filter change). Lets consumers
    // surface skeleton states without unmounting the surrounding page layout.
    isReloading: isPlaceholderData,
    infiniteScroll,
  }
}

export function useIssueDetail({
  projectId,
  issueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getIssueDetailQueryKey(projectId, issueId),
    queryFn: (): Promise<IssueDetailRecord | null> => getIssueDetail({ data: { projectId, issueId } }),
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
  })
}

export function useIssue({
  projectId,
  issueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getIssueQueryKey(projectId, issueId),
    queryFn: (): Promise<IssueSummaryRecord | null> => getIssue({ data: { projectId, issueId } }),
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
  })
}

export function useIssueTracesInfiniteScroll({
  projectId,
  issueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly enabled?: boolean
}) {
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: getIssueTracesQueryKey(projectId, issueId),
    queryFn: async ({ pageParam }): Promise<IssueTracePageRecord> => {
      const pageKey = getIssueTracesPageKey(projectId, issueId, pageParam)
      const result = await queryClient.fetchQuery({
        queryKey: pageKey,
        queryFn: () =>
          listIssueTraces({
            data: {
              projectId,
              issueId,
              limit: ISSUE_TRACE_BATCH_SIZE,
              offset: pageParam,
            },
          }),
        staleTime: ISSUES_QUERY_STALE_TIME_MS,
      })

      if (result.hasMore) {
        const nextOffset = result.offset + result.limit
        void queryClient.prefetchQuery({
          queryKey: getIssueTracesPageKey(projectId, issueId, nextOffset),
          queryFn: () =>
            listIssueTraces({
              data: {
                projectId,
                issueId,
                limit: ISSUE_TRACE_BATCH_SIZE,
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
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage ?? false,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const data: readonly IssueTraceRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((page) => page.items) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}

const invalidateIssueDetailQueries = (projectId: string, issueId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: getIssueQueryKey(projectId, issueId) }),
    queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(projectId, issueId) }),
    queryClient.invalidateQueries({ queryKey: getIssueTracesQueryKey(projectId, issueId) }),
    queryClient.invalidateQueries({ queryKey: ["issue-traces-page", projectId, issueId] }),
  ])

export const invalidateIssueQueries = (projectId: string, issueId?: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
    ...(issueId ? [invalidateIssueDetailQueries(projectId, issueId)] : []),
  ])
