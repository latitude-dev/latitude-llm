import type { FilterSet } from "@domain/shared"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  countSessionsByProject,
  getSessionDetail,
  getSessionDistinctValues,
  getSessionMetricsByProject,
  listSessionIssues,
  listSessionsByProject,
  type SessionDetailRecord,
  type SessionRecord,
  type SessionSearchMatchRecord,
} from "./sessions.functions.ts"

const BATCH_SIZE = 50

/**
 * A session is "live" while its most recent span end (`max_end_time`,
 * serialized as `endTime`) is within this window of now; otherwise "idle".
 * Derived inline at read time — there is no PG status table or cron.
 */
const SESSION_LIVE_THRESHOLD_MS = 5 * 60 * 1000

export type SessionStatus = "live" | "idle"

export function deriveSessionStatus(endTime: string | Date, now: number = Date.now()): SessionStatus {
  const last = typeof endTime === "string" ? new Date(endTime).getTime() : endTime.getTime()
  return now - last < SESSION_LIVE_THRESHOLD_MS ? "live" : "idle"
}

export function useSessionsInfiniteScroll({
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
  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["sessionsInfiniteScroll", projectId, sorting, filters, searchQuery],
    queryFn: async ({ pageParam }) => {
      const result = await listSessionsByProject({
        data: {
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
          filters,
          ...(searchQuery ? { searchQuery } : {}),
        },
      })
      return result ?? { sessions: [], hasMore: false }
    },
    initialPageParam: undefined as
      | { sortValue: string; secondaryValue?: string | undefined; sessionId: string }
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

  const data: readonly SessionRecord[] = useMemo(
    () => paginatedData?.pages.flatMap((p) => p?.sessions ?? []) ?? [],
    [paginatedData],
  )

  // `searchMatches` is page-level metadata — every page carries the same
  // shape (keyed by `sessionId`), so merging them in arrival order gives
  // the caller a single lookup table covering every visible session.
  const searchMatches: Readonly<Record<string, SessionSearchMatchRecord>> | undefined = useMemo(() => {
    if (!searchQuery) return undefined
    const merged: Record<string, SessionSearchMatchRecord> = {}
    for (const page of paginatedData?.pages ?? []) {
      if (!page?.searchMatches) continue
      Object.assign(merged, page.searchMatches)
    }
    return merged
  }, [paginatedData, searchQuery])

  return { data, isLoading, infiniteScroll, searchMatches }
}

/**
 * Counts sessions for a project with optional filters + free-text search.
 * When `searchQuery` is non-empty the response also includes
 * `matchingTraceCount` so the UI can render "N sessions · M matching traces".
 */
export function useSessionsCount({
  projectId,
  filters,
  searchQuery,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
  readonly searchQuery?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["sessionsCount", projectId, filters, searchQuery],
    queryFn: () =>
      countSessionsByProject({
        data: {
          projectId,
          ...(filters ? { filters } : {}),
          ...(searchQuery ? { searchQuery } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })

  return {
    totalCount: data?.totalCount ?? 0,
    matchingTraceCount: data?.matchingTraceCount,
    isLoading,
  }
}

/**
 * Single-session point lookup for the session panel header + Metadata tab.
 * While the session reads as `live`, the query refetches every 30s so the
 * header pill stays fresh; once it goes `idle` the polling stops.
 */
export function useSessionDetail({
  projectId,
  sessionId,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["session-detail", projectId, sessionId],
    queryFn: async () => {
      const result = await getSessionDetail({ data: { projectId, sessionId } })
      return result as SessionDetailRecord | null
    },
    enabled: enabled && projectId.length > 0 && sessionId.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      return deriveSessionStatus(data.endTime) === "live" ? 30_000 : false
    },
  })
}

/**
 * Issues scored across a session's traces — drives the panel's Issues tab.
 * Scoped by `traceIds` (the session's authoritative trace set) so orphan
 * sessions still surface their issues.
 */
export function useSessionIssues({
  projectId,
  traceIds,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["session-issues", projectId, [...traceIds].sort()],
    queryFn: () => listSessionIssues({ data: { projectId, traceIds: [...traceIds] } }),
    enabled: enabled && projectId.length > 0 && traceIds.length > 0,
    staleTime: 30_000,
  })
}

export function useSessionMetrics({
  projectId,
  filters,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
}) {
  return useQuery({
    queryKey: ["sessions-metrics", projectId, filters],
    queryFn: () =>
      getSessionMetricsByProject({
        data: {
          projectId,
          ...(filters ? { filters } : {}),
        },
      }),
    staleTime: 30_000,
  })
}

export function useSessionDistinctValues({
  projectId,
  column,
  search,
  enabled = true,
}: {
  readonly projectId: string
  readonly column: "tags" | "models" | "providers" | "serviceNames"
  readonly search?: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["session-distinct", projectId, column, search],
    queryFn: () => getSessionDistinctValues({ data: { projectId, column, limit: 50, ...(search ? { search } : {}) } }),
    staleTime: 60_000,
    enabled: enabled && projectId.length > 0,
    // Keep the previous matches visible while the next query for a new search
    // term is in flight, so the dropdown doesn't flash empty on every keystroke.
    placeholderData: keepPreviousData,
  })
}
