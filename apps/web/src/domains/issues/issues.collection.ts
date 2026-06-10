import type { IssueDimension } from "@domain/scores"
import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type {
  IssueDetailRecord,
  IssueDimensionsRecord,
  IssueImpactRecord,
  IssueOccurrenceRecord,
  IssueRecord,
  IssueSummaryRecord,
  IssuesListResultRecord,
  IssueTracePageRecord,
  IssueTraceRecord,
  OrgIssueSearchRecord,
  RelatedIssueRecord,
  UpdateIssueTriageRecord,
} from "./issues.functions.ts"
import {
  countIssueTraces,
  getIssue,
  getIssueDetail,
  getIssueDimensions,
  getIssueImpact,
  getIssueOccurrences,
  getRelatedIssues,
  listIssues,
  listIssueTraces,
  searchOrgIssues,
  updateIssueTriage,
} from "./issues.functions.ts"

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
  histogramBucketSeconds: 24 * 60 * 60,
  totalTraces: 0,
}
const EMPTY_PRIORITY_COUNTS: IssuesListResultRecord["priorityCounts"] = {
  urgent: 0,
  high: 0,
  medium: 0,
  low: 0,
  none: 0,
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
  readonly assigneeIds: readonly string[] | undefined
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
    input.assigneeIds?.length ? [...input.assigneeIds].sort().join(",") : null,
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

const getIssueImpactQueryKey = (projectId: string, issueId: string) => ["issue-impact", projectId, issueId] as const

const getIssueDimensionsQueryKey = (projectId: string, issueId: string, dimension: IssueDimension) =>
  ["issue-dimensions", projectId, issueId, dimension] as const

const getIssueOccurrencesQueryKey = (projectId: string, issueId: string) =>
  ["issue-occurrences", projectId, issueId] as const

const getRelatedIssuesQueryKey = (projectId: string, issueId: string) => ["related-issues", projectId, issueId] as const

const getIssueTracesQueryKey = (projectId: string, issueId: string) => ["issue-traces", projectId, issueId] as const

const getIssueTracesPageKey = (projectId: string, issueId: string, offset: number) =>
  ["issue-traces-page", projectId, issueId, offset] as const

const getIssueTracesCountQueryKey = (projectId: string, issueId: string) =>
  ["issue-traces-count", projectId, issueId] as const

const buildListIssuesRequest = (input: IssuesKeyInput, offset: number) => ({
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

export function useIssues(input: {
  readonly projectId: string
  readonly lifecycleGroup?: "active" | "archived"
  readonly assigneeIds?: readonly string[]
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
    assigneeIds: input.assigneeIds?.length ? input.assigneeIds : undefined,
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
      keyInput.assigneeIds,
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
    hasAnyIssues: firstPage?.hasAnyIssues ?? false,
    occurrencesSum: firstPage?.occurrencesSum ?? 0,
    priorityCounts: firstPage?.priorityCounts ?? EMPTY_PRIORITY_COUNTS,
    myIssuesCount: firstPage?.myIssuesCount ?? 0,
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
export function useIssuesOrgSearch(
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
    queryFn: (): Promise<readonly OrgIssueSearchRecord[]> =>
      searchOrgIssues({
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

export function useIssueImpact({
  projectId,
  issueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getIssueImpactQueryKey(projectId, issueId),
    queryFn: (): Promise<IssueImpactRecord> => getIssueImpact({ data: { projectId, issueId } }),
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

export function useIssueDimensions({
  projectId,
  issueId,
  dimension,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly dimension: IssueDimension
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getIssueDimensionsQueryKey(projectId, issueId, dimension),
    queryFn: (): Promise<IssueDimensionsRecord> => getIssueDimensions({ data: { projectId, issueId, dimension } }),
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

export function useRelatedIssues({
  projectId,
  issueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getRelatedIssuesQueryKey(projectId, issueId),
    queryFn: (): Promise<readonly RelatedIssueRecord[]> => getRelatedIssues({ data: { projectId, issueId } }),
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

export function useIssueOccurrences({
  projectId,
  issueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getIssueOccurrencesQueryKey(projectId, issueId),
    queryFn: (): Promise<{ readonly items: readonly IssueOccurrenceRecord[] }> =>
      getIssueOccurrences({ data: { projectId, issueId } }),
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })
}

/**
 * Mutation for the light-triage fields (assignee, priority). Omit a field to
 * leave it unchanged; pass `null` to clear it. Invalidates the issue detail
 * queries AND the issues list on success — the list groups by priority and
 * filters/counts by assignee, so triage edits must regroup it.
 */
export function useUpdateIssueTriage(projectId: string, issueId: string) {
  return useMutation({
    mutationFn: (input: {
      readonly assigneeId?: string | null
      readonly priority?: UpdateIssueTriageRecord["priority"]
    }): Promise<UpdateIssueTriageRecord> =>
      updateIssueTriage({
        data: {
          projectId,
          issueId,
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
      }),
    onSuccess: () => invalidateIssueQueries(projectId, issueId),
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

export function useIssueTracesCount({
  projectId,
  issueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly enabled?: boolean
}) {
  const { data } = useQuery({
    queryKey: getIssueTracesCountQueryKey(projectId, issueId),
    queryFn: () => countIssueTraces({ data: { projectId, issueId } }),
    enabled: enabled && projectId.length > 0 && issueId.length > 0,
    staleTime: ISSUES_QUERY_STALE_TIME_MS,
  })

  return data?.total ?? 0
}

const invalidateIssueDetailQueries = (projectId: string, issueId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: getIssueQueryKey(projectId, issueId) }),
    queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(projectId, issueId) }),
    queryClient.invalidateQueries({ queryKey: getIssueImpactQueryKey(projectId, issueId) }),
    queryClient.invalidateQueries({ queryKey: getIssueTracesQueryKey(projectId, issueId) }),
    queryClient.invalidateQueries({ queryKey: ["issue-traces-page", projectId, issueId] }),
    queryClient.invalidateQueries({ queryKey: getIssueTracesCountQueryKey(projectId, issueId) }),
  ])

export const invalidateIssueQueries = (projectId: string, issueId?: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
    ...(issueId ? [invalidateIssueDetailQueries(projectId, issueId)] : []),
  ])
