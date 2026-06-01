import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  getMonitorBySlug,
  listMonitorIncidents,
  listMonitors,
  type MonitorIncidentRecord,
  type MonitorIncidentsCursor,
  type MonitorRecord,
} from "./monitors.functions.ts"

export type { MonitorRecord }
/** @public Consumed by the M4 details panel incidents table; not yet wired in M2. */
export type { MonitorIncidentRecord }

const DEFAULT_MONITORS_PAGE_SIZE = 50
const DEFAULT_INCIDENTS_PAGE_SIZE = 50
const MONITORS_QUERY_STALE_TIME_MS = 30_000

const getListMonitorsQueryKey = (projectId: string, limit: number, searchQuery: string | undefined) =>
  ["monitors", "list", projectId, limit, searchQuery ?? null] as const

const getMonitorQueryKey = (projectId: string, slug: string) => ["monitors", "get", projectId, slug] as const

const getMonitorIncidentsQueryKey = (monitorId: string, limit: number) =>
  ["monitors", "incidents", monitorId, limit] as const

export function useMonitors(input: {
  readonly projectId: string
  readonly limit?: number
  readonly searchQuery?: string
  readonly enabled?: boolean
}) {
  const limit = input.limit ?? DEFAULT_MONITORS_PAGE_SIZE
  const trimmedSearchQuery = input.searchQuery?.trim() || undefined

  const { data, isLoading, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: getListMonitorsQueryKey(input.projectId, limit, trimmedSearchQuery),
    queryFn: ({ pageParam }) =>
      listMonitors({
        data: {
          projectId: input.projectId,
          limit,
          offset: pageParam,
          ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    placeholderData: keepPreviousData,
    staleTime: MONITORS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && input.projectId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({ hasMore: hasNextPage ?? false, isLoadingMore: isFetchingNextPage, onLoadMore: fetchNextPage }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const monitors = useMemo<readonly MonitorRecord[]>(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  return {
    monitors,
    totalCount: data?.pages[0]?.totalCount ?? 0,
    isLoading,
    isReloading: isPlaceholderData,
    infiniteScroll,
  }
}

/** @public Consumed by the M4 details panel; not yet wired in M2. */
export function useMonitor(input: { readonly projectId: string; readonly slug: string; readonly enabled?: boolean }) {
  return useQuery({
    queryKey: getMonitorQueryKey(input.projectId, input.slug),
    queryFn: (): Promise<MonitorRecord | null> =>
      getMonitorBySlug({ data: { projectId: input.projectId, slug: input.slug } }),
    staleTime: MONITORS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && Boolean(input.slug),
  })
}

/** @public Consumed by the M4 details panel incidents table; not yet wired in M2. */
export function useMonitorIncidents(input: {
  readonly monitorId: string
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const limit = input.limit ?? DEFAULT_INCIDENTS_PAGE_SIZE

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: getMonitorIncidentsQueryKey(input.monitorId, limit),
    queryFn: ({ pageParam }) =>
      listMonitorIncidents({
        data: { monitorId: input.monitorId, limit, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: null as MonitorIncidentsCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: MONITORS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && Boolean(input.monitorId),
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({ hasMore: hasNextPage ?? false, isLoadingMore: isFetchingNextPage, onLoadMore: fetchNextPage }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const incidents = useMemo<readonly MonitorIncidentRecord[]>(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  )

  return { incidents, isLoading, infiniteScroll }
}
