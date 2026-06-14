import type { MonitorTarget } from "@domain/monitors"
import type { AlertIncidentCondition, AlertIncidentKind, AlertIncidentSourceType, AlertSeverity } from "@domain/shared"
import { type InfiniteTableInfiniteScroll, useToast } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import { toUserMessage } from "../../lib/errors.ts"
import {
  createMonitor,
  deleteMonitor,
  getMonitorBySlug,
  getMonitorIncidentStats,
  listMonitorIncidents,
  listMonitors,
  listSavedSearchMonitorSummaries,
  type MonitorIncidentRecord,
  type MonitorIncidentsCursor,
  type MonitorListRowRecord,
  type MonitorRecord,
  type MonitorSearchRecord,
  muteMonitor,
  resolveMonitorIncident,
  type SavedSearchMonitorSummaryRecord,
  searchMonitorsOrgWide,
  unmuteMonitor,
  updateMonitor,
  updateMonitorAlert,
} from "./monitors.functions.ts"

/** Client-side alert draft mirroring the server `createAlertFieldsSchema`. `source` is null for unified `event.*`/`metric.*` alerts. */
export interface MonitorAlertDraft {
  readonly kind: AlertIncidentKind
  readonly source: { readonly type: AlertIncidentSourceType; readonly id: string | null } | null
  readonly condition?: AlertIncidentCondition | null
  readonly severity?: AlertSeverity
}

export type { MonitorListRowRecord, MonitorRecord }
/** @public Consumed by the M4 details panel incidents table; not yet wired in M2. */
export type { MonitorIncidentRecord }

const DEFAULT_MONITORS_PAGE_SIZE = 50
const ORG_SEARCH_LIMIT = 8
const DEFAULT_INCIDENTS_PAGE_SIZE = 50
const MONITORS_QUERY_STALE_TIME_MS = 30_000

const getListMonitorsQueryKey = (
  projectId: string,
  limit: number,
  searchQuery: string | undefined,
  system: boolean | undefined,
) => ["monitors", "list", projectId, limit, searchQuery ?? null, system ?? null] as const

const getMonitorQueryKey = (projectId: string, slug: string) => ["monitors", "get", projectId, slug] as const

const getMonitorIncidentsQueryKey = (projectId: string, monitorId: string, limit: number) =>
  ["monitors", "incidents", projectId, monitorId, limit] as const

const getMonitorIncidentStatsQueryKey = (projectId: string, monitorId: string) =>
  ["monitors", "incident-stats", projectId, monitorId] as const

export function useMonitors(input: {
  readonly projectId: string
  readonly limit?: number
  readonly searchQuery?: string
  readonly system?: boolean
  readonly enabled?: boolean
}) {
  const limit = input.limit ?? DEFAULT_MONITORS_PAGE_SIZE
  const trimmedSearchQuery = input.searchQuery?.trim() || undefined

  const { data, isLoading, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: getListMonitorsQueryKey(input.projectId, limit, trimmedSearchQuery, input.system),
    queryFn: ({ pageParam }) =>
      listMonitors({
        data: {
          projectId: input.projectId,
          limit,
          offset: pageParam,
          ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
          ...(input.system !== undefined ? { system: input.system } : {}),
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

  const rows = useMemo<readonly MonitorListRowRecord[]>(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const monitors = useMemo<readonly MonitorRecord[]>(() => rows.map((row) => row.monitor), [rows])

  return {
    rows,
    monitors,
    totalCount: data?.pages[0]?.totalCount ?? 0,
    isLoading,
    isReloading: isPlaceholderData,
    infiniteScroll,
  }
}

/**
 * Org-wide monitor search for the Command Palette. Returns matching monitors across every project
 * in the organization (each carrying its owning project's slug/name plus system/muted status).
 * `preferProjectId` (the current project, when inside one) ranks that project's monitors first.
 */
export function useMonitorsSearch(
  searchQuery: string,
  { enabled = true, preferProjectId }: { enabled?: boolean; preferProjectId?: string | undefined } = {},
) {
  const trimmed = searchQuery.trim()
  const { data, isLoading } = useQuery({
    queryKey: ["monitors", "orgSearch", trimmed, preferProjectId ?? null],
    queryFn: (): Promise<readonly MonitorSearchRecord[]> =>
      searchMonitorsOrgWide({
        data: {
          searchQuery: trimmed,
          limit: ORG_SEARCH_LIMIT,
          ...(preferProjectId ? { preferProjectId } : {}),
        },
      }),
    staleTime: MONITORS_QUERY_STALE_TIME_MS,
    enabled: enabled && trimmed.length > 0,
  })
  return { data: data ?? [], isLoading }
}

/** Point lookup by slug — backs the detail drawer for monitors outside the list (e.g. system monitors). */
export function useMonitor(input: { readonly projectId: string; readonly slug: string; readonly enabled?: boolean }) {
  return useQuery({
    queryKey: getMonitorQueryKey(input.projectId, input.slug),
    queryFn: (): Promise<MonitorRecord | null> =>
      getMonitorBySlug({ data: { projectId: input.projectId, slug: input.slug } }),
    staleTime: MONITORS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && Boolean(input.slug),
  })
}

const EMPTY_SAVED_SEARCH_MONITOR_SUMMARIES: Record<string, SavedSearchMonitorSummaryRecord> = {}

/**
 * Batched `savedSearchId -> { monitorSlug, monitorCount, severities }` map (earliest-created
 * live, unmuted monitor per saved search) backing the saved-search dropdown rows and the
 * monitored-state chip on the traces page. One call per project.
 */
export function useSavedSearchMonitorSummaries(projectId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const { data } = useQuery({
    queryKey: ["monitors", "savedSearchSummaries", projectId] as const,
    queryFn: () => listSavedSearchMonitorSummaries({ data: { projectId } }),
    staleTime: MONITORS_QUERY_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0,
  })
  return data ?? EMPTY_SAVED_SEARCH_MONITOR_SUMMARIES
}

/** @public Consumed by the M4 details panel incidents table; not yet wired in M2. */
export function useMonitorIncidents(input: {
  readonly projectId: string
  readonly monitorId: string
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const limit = input.limit ?? DEFAULT_INCIDENTS_PAGE_SIZE

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: getMonitorIncidentsQueryKey(input.projectId, input.monitorId, limit),
    queryFn: ({ pageParam }) =>
      listMonitorIncidents({
        data: {
          projectId: input.projectId,
          monitorId: input.monitorId,
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
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

interface MonitorIncidentStats {
  readonly total: number
  readonly firstStartedAtIso: string | null
  readonly lastIncidentId: string | null
  readonly lastStartedAtIso: string | null
  readonly lastEndedAtIso: string | null
}

export function useMonitorIncidentStats(input: {
  readonly projectId: string
  readonly monitorId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getMonitorIncidentStatsQueryKey(input.projectId, input.monitorId),
    queryFn: (): Promise<MonitorIncidentStats> => getMonitorIncidentStats({ data: { monitorId: input.monitorId } }),
    staleTime: MONITORS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && Boolean(input.monitorId),
  })
}

/**
 * Mute/unmute action shared by the dashboard 3-dots menu and the details panel.
 * Calls the server fn, invalidates the monitor list + detail queries, and toasts.
 * Re-throws so the caller can keep its confirmation modal open on failure.
 */
export function useMonitorMuteAction(projectId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [isPending, setIsPending] = useState(false)

  const setMuted = useCallback(
    async (monitor: MonitorRecord, muted: boolean) => {
      setIsPending(true)
      try {
        await (muted ? muteMonitor : unmuteMonitor)({ data: { monitorId: monitor.id } })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["monitors", "list", projectId] }),
          queryClient.invalidateQueries({ queryKey: ["monitors", "get", projectId] }),
          // Muted monitors drop out of the saved-search summaries (traces-page chip).
          queryClient.invalidateQueries({ queryKey: ["monitors", "savedSearchSummaries", projectId] }),
        ])
        toast({ description: muted ? "Monitor muted." : "Monitor unmuted." })
      } catch (error) {
        toast({ variant: "destructive", description: toUserMessage(error) })
        throw error
      } finally {
        setIsPending(false)
      }
    },
    [projectId, queryClient, toast],
  )

  return { setMuted, isPending }
}

/**
 * Resolve an ongoing incident, shared by the dashboard "Last incident" pill
 * and the details-panel incidents table. Calls the server fn, invalidates the
 * monitor list + incident queries, and toasts. Re-throws so the caller can
 * keep its confirmation modal open on failure.
 */
export function useIncidentResolveAction(projectId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [isPending, setIsPending] = useState(false)

  const resolve = useCallback(
    async (incidentId: string) => {
      setIsPending(true)
      try {
        await resolveMonitorIncident({ data: { incidentId } })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["monitors", "list", projectId] }),
          queryClient.invalidateQueries({ queryKey: ["monitors", "incidents", projectId] }),
          queryClient.invalidateQueries({ queryKey: ["monitors", "incident-stats", projectId] }),
        ])
        toast({ description: "Incident resolved." })
      } catch (error) {
        toast({ variant: "destructive", description: toUserMessage(error) })
        throw error
      } finally {
        setIsPending(false)
      }
    },
    [projectId, queryClient, toast],
  )

  return { resolve, isPending }
}

const invalidateMonitorQueries = (queryClient: ReturnType<typeof useQueryClient>, projectId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["monitors", "list", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["monitors", "get", projectId] }),
    // Saved-search ↔ monitor summaries back the traces-page chip and selector
    // rows; creating/deleting/muting monitors changes them.
    queryClient.invalidateQueries({ queryKey: ["monitors", "savedSearchSummaries", projectId] }),
  ])

/** Broad invalidation for bulk actions — the list/detail queries plus the drawer's incidents and stats. */
export const invalidateAllMonitorQueries = (queryClient: ReturnType<typeof useQueryClient>, projectId: string) =>
  Promise.all([
    invalidateMonitorQueries(queryClient, projectId),
    queryClient.invalidateQueries({ queryKey: ["monitors", "incidents", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["monitors", "incident-stats", projectId] }),
  ])

/** Create a user monitor (with its alerts). Invalidates the list on success. */
export function useCreateMonitor(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      readonly name: string
      readonly description?: string
      readonly alerts: readonly MonitorAlertDraft[]
      readonly target?: MonitorTarget
    }) =>
      createMonitor({
        data: {
          projectId,
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
          alerts: input.alerts.map((alert) => ({ ...alert })),
          ...(input.target !== undefined ? { target: input.target } : {}),
        },
      }),
    onSuccess: () => invalidateMonitorQueries(queryClient, projectId),
  })
}

/** Rename / re-describe a user monitor. Renames change the slug, so the detail queries refetch too. */
export function useUpdateMonitor(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { readonly monitorId: string; readonly name?: string; readonly description?: string }) =>
      updateMonitor({ data: input }),
    onSuccess: () => invalidateMonitorQueries(queryClient, projectId),
  })
}

/** Soft-delete a user monitor. */
export function useDeleteMonitor(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (monitorId: string) => deleteMonitor({ data: { monitorId } }),
    onSuccess: () => invalidateMonitorQueries(queryClient, projectId),
  })
}

/**
 * Per-alert actions used by the details-panel alert block: edit an alert's
 * configurable values in place. Alerts are never added or deleted from the
 * app — a monitor keeps the single alert it was created with. Invalidates the
 * list + detail queries so the panel reflects the change.
 */
export function useMonitorAlertActions(projectId: string) {
  const queryClient = useQueryClient()
  const onSuccess = () => invalidateMonitorQueries(queryClient, projectId)

  const editAlert = useMutation({
    mutationFn: (input: {
      readonly monitorId: string
      readonly alertId: string
      readonly kind?: AlertIncidentKind
      readonly source?: { readonly type: AlertIncidentSourceType; readonly id: string | null }
      readonly condition?: AlertIncidentCondition | null
      readonly severity?: AlertSeverity
    }) => updateMonitorAlert({ data: input }),
    onSuccess,
  })

  return { editAlert }
}
