import type { ToolContextDimension } from "@domain/spans"
import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  getProjectToolDetail,
  getToolCallHistogram,
  getToolContextBreakdown,
  getToolCoOccurrence,
  getToolErrorBreakdown,
  getToolParameterStats,
  listProjectTools,
  listRecentDefiningSpans,
  type RecentDefiningSpanRecord,
} from "./tools.functions.ts"

/** Inclusive time window shared by every tools query. */
export interface ToolsTimeRange {
  readonly fromIso: string
  readonly toIso: string
}

const RECENT_CALLS_BATCH_SIZE = 20

export function useProjectTools({
  projectId,
  range,
  trendBucketSeconds,
}: {
  readonly projectId: string
  readonly range: ToolsTimeRange
  readonly trendBucketSeconds: number
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "tools", projectId, range, trendBucketSeconds],
    queryFn: () => listProjectTools({ data: { ...projectScopeData(scope), projectId, ...range, trendBucketSeconds } }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: projectId.length > 0,
  })
}

export function useToolDetail({
  projectId,
  toolName,
  range,
  errorsOnly,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly errorsOnly?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "tools-detail", projectId, toolName, range, errorsOnly ?? false],
    queryFn: () =>
      getProjectToolDetail({
        data: {
          ...projectScopeData(scope),
          projectId,
          toolName,
          ...range,
          ...(errorsOnly === undefined ? {} : { errorsOnly }),
        },
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: projectId.length > 0 && toolName.length > 0,
  })
}

export function useToolCallHistogram({
  projectId,
  toolName,
  range,
  bucketSeconds,
  errorsOnly,
  enabled = true,
}: {
  readonly projectId: string
  readonly toolName?: string
  readonly range: ToolsTimeRange
  readonly bucketSeconds: number
  readonly errorsOnly?: boolean
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [
      ...projectScopeKey(scope),
      "tools-histogram",
      projectId,
      toolName ?? null,
      range,
      bucketSeconds,
      errorsOnly ?? false,
    ],
    queryFn: () =>
      getToolCallHistogram({
        data: {
          ...projectScopeData(scope),
          projectId,
          ...range,
          bucketSeconds,
          ...(toolName === undefined ? {} : { toolName }),
          ...(errorsOnly === undefined ? {} : { errorsOnly }),
        },
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0,
  })
}

export function useToolParameterStats({
  projectId,
  toolName,
  range,
  errorsOnly,
  enabled = true,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly errorsOnly?: boolean
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "tools-parameters", projectId, toolName, range, errorsOnly ?? false],
    queryFn: () =>
      getToolParameterStats({
        data: {
          ...projectScopeData(scope),
          projectId,
          toolName,
          ...range,
          ...(errorsOnly === undefined ? {} : { errorsOnly }),
        },
      }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0 && toolName.length > 0,
  })
}

export function useToolContextBreakdown({
  projectId,
  toolName,
  dimension,
  range,
  errorsOnly,
  enabled = true,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly dimension: ToolContextDimension
  readonly range: ToolsTimeRange
  readonly errorsOnly?: boolean
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "tools-context", projectId, toolName, dimension, range, errorsOnly ?? false],
    queryFn: () =>
      getToolContextBreakdown({
        data: {
          ...projectScopeData(scope),
          projectId,
          toolName,
          dimension,
          ...range,
          ...(errorsOnly === undefined ? {} : { errorsOnly }),
        },
      }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0 && toolName.length > 0,
  })
}

export function useToolCoOccurrence({
  projectId,
  toolName,
  range,
  errorsOnly,
  enabled = true,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly errorsOnly?: boolean
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "tools-co-occurrence", projectId, toolName, range, errorsOnly ?? false],
    queryFn: () =>
      getToolCoOccurrence({
        data: {
          ...projectScopeData(scope),
          projectId,
          toolName,
          ...range,
          ...(errorsOnly === undefined ? {} : { errorsOnly }),
        },
      }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0 && toolName.length > 0,
  })
}

export function useToolErrorBreakdown({
  projectId,
  toolName,
  range,
  enabled = true,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "tools-error-breakdown", projectId, toolName, range],
    queryFn: () =>
      getToolErrorBreakdown({
        data: {
          ...projectScopeData(scope),
          projectId,
          toolName,
          ...range,
        },
      }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0 && toolName.length > 0,
  })
}

export function useRecentDefiningSpans({
  projectId,
  toolName,
  range,
  enabled = true,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...projectScopeKey(scope), "tools-recent-defining", projectId, toolName, range],
    queryFn: async ({ pageParam }) =>
      listRecentDefiningSpans({
        data: {
          ...projectScopeData(scope),
          projectId,
          toolName,
          ...range,
          limit: RECENT_CALLS_BATCH_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    initialPageParam: undefined as { startTimeIso: string; spanId: string } | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
    enabled: enabled && projectId.length > 0 && toolName.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const data: readonly RecentDefiningSpanRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.items ?? []) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}
