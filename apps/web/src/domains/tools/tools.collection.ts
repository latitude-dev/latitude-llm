import type { ToolContextDimension } from "@domain/spans"
import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { use, useMemo } from "react"
import { TraceScopeContext, traceScopeData, traceScopeKey } from "../traces/trace-scope.tsx"
import {
  getProjectToolDetail,
  getToolCallHistogram,
  getToolContextBreakdown,
  getToolCoOccurrence,
  getToolParameterStats,
  listProjectTools,
  listRecentToolCalls,
  type RecentToolCallRecord,
} from "./tools.functions.ts"

/** Time window shared by every tools query (ISO strings, range inclusive). */
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "tools", projectId, range, trendBucketSeconds],
    queryFn: () => listProjectTools({ data: { ...traceScopeData(scope), projectId, ...range, trendBucketSeconds } }),
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "tools-detail", projectId, toolName, range, errorsOnly ?? false],
    queryFn: () =>
      getProjectToolDetail({
        data: {
          ...traceScopeData(scope),
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [
      ...traceScopeKey(scope),
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
          ...traceScopeData(scope),
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "tools-parameters", projectId, toolName, range, errorsOnly ?? false],
    queryFn: () =>
      getToolParameterStats({
        data: {
          ...traceScopeData(scope),
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "tools-context", projectId, toolName, dimension, range, errorsOnly ?? false],
    queryFn: () =>
      getToolContextBreakdown({
        data: {
          ...traceScopeData(scope),
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [...traceScopeKey(scope), "tools-co-occurrence", projectId, toolName, range, errorsOnly ?? false],
    queryFn: () =>
      getToolCoOccurrence({
        data: {
          ...traceScopeData(scope),
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

export function useRecentToolCalls({
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
  const scope = use(TraceScopeContext)
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...traceScopeKey(scope), "tools-recent-calls", projectId, toolName, range, errorsOnly ?? false],
    queryFn: async ({ pageParam }) =>
      listRecentToolCalls({
        data: {
          ...traceScopeData(scope),
          projectId,
          toolName,
          ...range,
          limit: RECENT_CALLS_BATCH_SIZE,
          ...(errorsOnly === undefined ? {} : { errorsOnly }),
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

  const data: readonly RecentToolCallRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.items ?? []) ?? [],
    [paginatedData],
  )

  return { data, isLoading, infiniteScroll }
}
