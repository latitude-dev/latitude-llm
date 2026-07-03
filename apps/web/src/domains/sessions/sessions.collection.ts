import type { FilterCondition, FilterSet, PercentileSessionFilterField } from "@domain/shared"
import type { CohortSummary, TraceDistribution, TraceTimeHistogramBucket } from "@domain/spans"
import { pickTraceHistogramBucketSeconds, resolveTraceHistogramRangeIso } from "@domain/spans"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  countSessionsByProject,
  getSessionCohortSummary,
  getSessionDetail,
  getSessionDistinctValues,
  getSessionDistribution,
  getSessionMetricsByProject,
  getSessionTimeHistogramByProject,
  listSessionSignals,
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

/**
 * Default-on session filter: hide "orphan fragment" rows that carry no LLM
 * activity (sessions whose every span produced 0 tokens and no model name).
 *
 * URL representation of the sidebar toggle:
 *   - key absent → default ON; this helper injects the filter.
 *   - `{op:"eq",value:true}` → explicit ON; equivalent to absent.
 *   - `{op:"eq",value:false}` → user opted out; stripped before querying so
 *     the repo applies no `hasLlmActivity` clause.
 */
export function withSessionDefaults(filters: FilterSet | undefined): FilterSet {
  if (filters?.hasLlmActivity !== undefined) {
    const explicit = filters.hasLlmActivity
    const optedOut = explicit.some((c) => c.op === "eq" && (c.value === false || c.value === "false"))
    if (optedOut) {
      const { hasLlmActivity: _drop, ...rest } = filters as Record<string, readonly FilterCondition[]>
      return rest as FilterSet
    }
    return filters
  }
  return { ...(filters ?? {}), hasLlmActivity: [{ op: "eq", value: true }] }
}

export function isHasLlmActivityFilterOn(filters: FilterSet | undefined): boolean {
  const cond = filters?.hasLlmActivity?.find((c) => c.op === "eq")
  if (cond === undefined) return true
  return cond.value !== false && cond.value !== "false"
}

function withoutHasLlmActivityFilter(filters: FilterSet): FilterSet {
  if (!("hasLlmActivity" in filters)) return filters
  const { hasLlmActivity: _drop, ...rest } = filters as Record<string, readonly FilterCondition[]>
  return rest as FilterSet
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
  const scope = useProjectScope()
  const effectiveFilters = useMemo(() => withSessionDefaults(filters), [filters])

  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...projectScopeKey(scope), "sessionsInfiniteScroll", projectId, sorting, effectiveFilters, searchQuery],
    queryFn: async ({ pageParam }) => {
      const result = await listSessionsByProject({
        data: {
          ...projectScopeData(scope),
          projectId,
          limit: BATCH_SIZE,
          cursor: pageParam,
          sortBy: sorting.column,
          sortDirection: sorting.direction,
          filters: effectiveFilters,
          ...(searchQuery ? { searchQuery } : {}),
        },
      })
      return result ?? { sessions: [], hasMore: false }
    },
    initialPageParam: undefined as
      | {
          sortValue: string
          secondaryValue?: string | undefined
          sessionId: string
        }
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
  const scope = useProjectScope()
  const effectiveFilters = useMemo(() => withSessionDefaults(filters), [filters])

  const { data, isLoading } = useQuery({
    queryKey: [...projectScopeKey(scope), "sessionsCount", projectId, effectiveFilters, searchQuery],
    queryFn: () =>
      countSessionsByProject({
        data: {
          ...projectScopeData(scope),
          projectId,
          filters: effectiveFilters,
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

export function useSessionsCountWithoutLlmActivityFilter({
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
  const filtersWithoutLlmActivity = useMemo(() => withoutHasLlmActivityFilter(withSessionDefaults(filters)), [filters])

  const { data, isLoading } = useQuery({
    queryKey: [
      ...projectScopeKey(scope),
      "sessionsCountWithoutLlmActivity",
      projectId,
      filtersWithoutLlmActivity,
      searchQuery,
    ],
    queryFn: () =>
      countSessionsByProject({
        data: {
          ...projectScopeData(scope),
          projectId,
          filters: filtersWithoutLlmActivity,
          ...(searchQuery ? { searchQuery } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })

  return {
    totalCount: data?.totalCount ?? 0,
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
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "session-detail", projectId, sessionId],
    queryFn: async () => {
      const result = await getSessionDetail({ data: { ...projectScopeData(scope), projectId, sessionId } })
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
 * Signals scored across a session's traces — drives the panel's Signals tab.
 * Scoped by `traceIds` (the session's authoritative trace set) so orphan
 * sessions still surface their issues.
 */
export function useSessionSignals({
  projectId,
  traceIds,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "session-issues", projectId, [...traceIds].sort()],
    queryFn: () => listSessionSignals({ data: { ...projectScopeData(scope), projectId, traceIds: [...traceIds] } }),
    enabled: enabled && projectId.length > 0 && traceIds.length > 0,
    staleTime: 30_000,
  })
}

export function useSessionCohortSummary({ projectId }: { readonly projectId: string }) {
  const scope = useProjectScope()
  return useQuery<CohortSummary>({
    queryKey: [...projectScopeKey(scope), "sessions-cohort-summary", projectId],
    queryFn: () =>
      getSessionCohortSummary({
        data: { ...projectScopeData(scope), projectId },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })
}

export function useSessionMetrics({
  projectId,
  filters,
}: {
  readonly projectId: string
  readonly filters?: FilterSet
}) {
  const scope = useProjectScope()
  const effectiveFilters = useMemo(() => withSessionDefaults(filters), [filters])

  return useQuery({
    queryKey: [...projectScopeKey(scope), "sessions-metrics", projectId, effectiveFilters],
    queryFn: () =>
      getSessionMetricsByProject({
        data: {
          ...projectScopeData(scope),
          projectId,
          filters: effectiveFilters,
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })
}

export function useSessionTimeHistogram({
  projectId,
  filters,
  rangeStartIso: rangeStartIsoOverride,
  rangeEndIso: rangeEndIsoOverride,
}: {
  readonly projectId: string
  readonly filters: FilterSet
  readonly rangeStartIso?: string
  readonly rangeEndIso?: string
}) {
  const scope = useProjectScope()
  const effectiveFilters = useMemo(() => withSessionDefaults(filters), [filters])

  const { rangeStartIso, rangeEndIso, bucketSeconds, queryKey } = useMemo(() => {
    const nowMs = Date.now()
    const { rangeStartIso: rs, rangeEndIso: re } = resolveTraceHistogramRangeIso(effectiveFilters, nowMs)
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
        "sessions-histogram",
        projectId,
        effectiveFilters,
        effectiveRangeStartIso,
        effectiveRangeEndIso,
        bs,
      ] as const,
    }
  }, [scope, projectId, effectiveFilters, rangeStartIsoOverride, rangeEndIsoOverride])

  const query = useQuery({
    queryKey,
    queryFn: (): Promise<readonly TraceTimeHistogramBucket[]> =>
      getSessionTimeHistogramByProject({
        data: {
          ...projectScopeData(scope),
          projectId,
          rangeStartIso,
          rangeEndIso,
          bucketSeconds,
          ...(Object.keys(effectiveFilters).length > 0 ? { filters: effectiveFilters } : {}),
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

export function useSessionDistribution({
  projectId,
  field,
  enabled = true,
}: {
  readonly projectId: string
  readonly field: PercentileSessionFilterField
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery<TraceDistribution>({
    queryKey: [...projectScopeKey(scope), "session-distribution", projectId, field],
    queryFn: () => getSessionDistribution({ data: { ...projectScopeData(scope), projectId, field } }),
    // Distribution is intentionally insensitive to other filters and changes
    // slowly relative to a user's interaction window — long stale time keeps
    // the chart steady while picking a threshold.
    staleTime: 60_000,
    enabled: enabled && projectId.length > 0,
  })
}

export function useSessionDistinctValues({
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
    queryKey: [...projectScopeKey(scope), "session-distinct", projectId, column, search],
    queryFn: () =>
      getSessionDistinctValues({
        data: { ...projectScopeData(scope), projectId, column, limit: 50, ...(search ? { search } : {}) },
      }),
    staleTime: 60_000,
    enabled: enabled && projectId.length > 0,
    // Keep the previous matches visible while the next query for a new search
    // term is in flight, so the dropdown doesn't flash empty on every keystroke.
    placeholderData: keepPreviousData,
  })
}
