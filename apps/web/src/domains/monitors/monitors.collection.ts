import type { AlertIncidentCondition, AlertIncidentKind, AlertIncidentSourceType, AlertSeverity } from "@domain/shared"
import { type InfiniteTableInfiniteScroll, useToast } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import { toUserMessage } from "../../lib/errors.ts"
import {
  createMonitor,
  createMonitorAlert,
  deleteMonitor,
  deleteMonitorAlert,
  getMonitorBySlug,
  listMonitorIncidents,
  listMonitors,
  type MonitorIncidentRecord,
  type MonitorIncidentsCursor,
  type MonitorRecord,
  muteMonitor,
  unmuteMonitor,
  updateMonitor,
  updateMonitorAlert,
} from "./monitors.functions.ts"

/** Client-side alert draft mirroring the server `createAlertFieldsSchema`. */
export interface MonitorAlertDraft {
  readonly kind: AlertIncidentKind
  readonly source: { readonly type: AlertIncidentSourceType; readonly id: string | null }
  readonly condition?: AlertIncidentCondition | null
  readonly severity?: AlertSeverity
}

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

const invalidateMonitorQueries = (queryClient: ReturnType<typeof useQueryClient>, projectId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["monitors", "list", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["monitors", "get", projectId] }),
  ])

/** Create a user monitor (with its alerts). Invalidates the list on success. */
export function useCreateMonitor(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      readonly name: string
      readonly description?: string
      readonly alerts: readonly MonitorAlertDraft[]
    }) =>
      createMonitor({
        data: {
          projectId,
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
          alerts: input.alerts.map((alert) => ({ ...alert })),
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
 * Per-alert CRUD used by the details-panel Alerts section: add a new alert,
 * edit an existing alert's configurable values, or remove one. Each invalidates
 * the list + detail queries so the panel reflects the change.
 */
export function useMonitorAlertActions(projectId: string) {
  const queryClient = useQueryClient()
  const onSuccess = () => invalidateMonitorQueries(queryClient, projectId)

  const addAlert = useMutation({
    mutationFn: (input: { readonly monitorId: string } & MonitorAlertDraft) =>
      createMonitorAlert({ data: { ...input } }),
    onSuccess,
  })
  const editAlert = useMutation({
    mutationFn: (input: {
      readonly monitorId: string
      readonly alertId: string
      readonly source?: { readonly type: AlertIncidentSourceType; readonly id: string | null }
      readonly condition?: AlertIncidentCondition | null
      readonly severity?: AlertSeverity
    }) => updateMonitorAlert({ data: input }),
    onSuccess,
  })
  const removeAlert = useMutation({
    mutationFn: (input: { readonly monitorId: string; readonly alertId: string }) =>
      deleteMonitorAlert({ data: input }),
    onSuccess,
  })

  return { addAlert, editAlert, removeAlert }
}
