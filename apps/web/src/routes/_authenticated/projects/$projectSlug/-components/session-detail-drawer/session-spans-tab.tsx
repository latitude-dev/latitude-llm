import { Button, Icon, Text } from "@repo/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import { ArrowUpRightIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { sandboxOrgIdForScope, useProjectScope } from "../../../../../../domains/projects/project-scope.tsx"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { useSpansBySessionPages } from "../../../../../../domains/spans/spans.collection.ts"
import { traceIdsSignature } from "../../../../../../domains/traces/trace-ids.ts"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"
import { SpanDetail } from "../trace-detail-drawer/tabs/spans-tab/span-detail/index.tsx"
import { SpanFiltersBar } from "../trace-detail-drawer/tabs/spans-tab/span-filters-bar.tsx"
import {
  GroupedSpanTree,
  type SpanTreeSelection,
  scrollSpanIntoView,
} from "../trace-detail-drawer/tabs/spans-tab/span-tree/index.tsx"
import { getTraceTimeRange } from "../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"
import { useSpanFilters } from "../trace-detail-drawer/tabs/spans-tab/use-span-filters.ts"
import {
  filterSessionSpanGroups,
  getLoadedSessionSpanTraceIds,
  getSessionTraceNumberById,
  groupSessionSpans,
  resolveSpanTraceId,
  spanSelectionKey,
} from "./session-spans.ts"
import { sessionTracePageQueryOptions } from "./use-session-traces.ts"

const SESSION_SPAN_TRACE_PAGE_SIZE = 25

function useSessionSpanTraces({
  projectId,
  sessionId,
  traceIds,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceIds: readonly string[]
}) {
  const scope = useProjectScope()
  const sandboxOrgId = sandboxOrgIdForScope(scope)
  const query = useInfiniteQuery({
    queryKey: ["session-span-traces", sandboxOrgId, projectId, sessionId, traceIdsSignature(traceIds)] as const,
    queryFn: ({ pageParam }) =>
      sessionTracePageQueryOptions(sandboxOrgId, projectId, sessionId, traceIds, SESSION_SPAN_TRACE_PAGE_SIZE, {
        sortDirection: "asc",
        ...(pageParam ? { cursor: pageParam } : {}),
      }).queryFn(),
    initialPageParam: undefined as
      | { readonly sortValue: string; readonly secondaryValue?: string | undefined; readonly traceId: string }
      | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: projectId.length > 0 && sessionId.length > 0 && traceIds.length > 0,
  })
  const traces = useMemo(() => query.data?.pages.flatMap((page) => page.traces) ?? [], [query.data])

  return { ...query, traces }
}

export function SessionSpansTab({
  projectId,
  session,
  selectedSpanId,
  selectedSpanTraceId,
  onSelectSpan,
  onOpenTrace,
  isActive,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly selectedSpanId: string
  readonly selectedSpanTraceId: string
  readonly onSelectSpan: (selection: SpanTreeSelection | null) => void
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
  readonly isActive: boolean
}) {
  const { filters, clearFilters, toggleErrors, toggleTools, toggleMemory, selectModel } = useSpanFilters()
  const traceQuery = useSessionSpanTraces({
    projectId,
    sessionId: session.sessionId,
    traceIds: session.traceIds,
  })
  const paginatedTraceIdPages = useMemo(
    () => traceQuery.data?.pages.map((page) => page.traces.map((trace) => trace.traceId)) ?? [],
    [traceQuery.data],
  )
  const loadedTraceIds = useMemo(
    () =>
      getLoadedSessionSpanTraceIds({
        loadedTraceIds: paginatedTraceIdPages.flat(),
        sessionTraceIds: session.traceIds,
        selectedSpanTraceId,
      }),
    [paginatedTraceIdPages, selectedSpanTraceId, session.traceIds],
  )
  const spanTraceIdPages = useMemo(() => {
    const paginatedTraceIds = new Set(paginatedTraceIdPages.flat())
    const extraTraceId = loadedTraceIds.find((traceId) => !paginatedTraceIds.has(traceId))
    return extraTraceId ? [...paginatedTraceIdPages, [extraTraceId]] : paginatedTraceIdPages
  }, [loadedTraceIds, paginatedTraceIdPages])
  const loadedTraces = useMemo(() => {
    const traceById = new Map(traceQuery.traces.map((trace) => [trace.traceId, trace]))
    return loadedTraceIds.flatMap((traceId) => {
      const trace = traceById.get(traceId)
      return trace ? [trace] : []
    })
  }, [loadedTraceIds, traceQuery.traces])
  const {
    data: spans,
    isLoading: isLoadingSpans,
    isError: isSpansError,
  } = useSpansBySessionPages({
    projectId,
    sessionId: session.sessionId,
    traceIdPages: spanTraceIdPages,
    startTimeFrom: session.startTime,
    startTimeTo: session.endTime,
  })
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const autoLoadingMoreRef = useRef(false)
  const groups = useMemo(() => groupSessionSpans(spans ?? [], loadedTraces), [loadedTraces, spans])
  const filteredGroups = useMemo(() => filterSessionSpanGroups(groups, filters), [filters, groups])
  const traceNumberById = useMemo(() => getSessionTraceNumberById(groups), [groups])
  const timeRangeByTraceId = useMemo(
    () => new Map(groups.map((group) => [group.traceId, getTraceTimeRange(group.spans)])),
    [groups],
  )
  const resolvedTraceId = selectedSpanTraceId || resolveSpanTraceId(groups, selectedSpanId).traceId || ""
  const selectedSpan = useMemo(
    () => (selectedSpanId && resolvedTraceId ? { traceId: resolvedTraceId, spanId: selectedSpanId } : null),
    [resolvedTraceId, selectedSpanId],
  )
  const isLoading = traceQuery.isLoading || (isLoadingSpans && (!spans || spans.length === 0))
  const isLoadingMore = traceQuery.isFetchingNextPage || (isLoadingSpans && (spans?.length ?? 0) > 0)
  const isError = traceQuery.isError || (isSpansError && (!spans || spans.length === 0))
  const loadMoreTraces = useCallback(() => {
    if (!traceQuery.hasNextPage || isLoadingMore || autoLoadingMoreRef.current) return

    autoLoadingMoreRef.current = true
    void traceQuery.fetchNextPage().finally(() => {
      autoLoadingMoreRef.current = false
    })
  }, [isLoadingMore, traceQuery.fetchNextPage, traceQuery.hasNextPage])

  useEffect(() => {
    if (!selectedSpanId || selectedSpanTraceId || isLoading) return
    const resolved = resolveSpanTraceId(groups, selectedSpanId)
    if (resolved.traceId) onSelectSpan({ traceId: resolved.traceId, spanId: selectedSpanId })
    else if (resolved.ambiguous || groups.length > 0) onSelectSpan(null)
  }, [groups, isLoading, onSelectSpan, selectedSpanId, selectedSpanTraceId])

  useEffect(() => {
    if (!selectedSpan || isLoading || isLoadingSpans) return
    const isVisible = filteredGroups.some(
      (group) =>
        group.traceId === selectedSpan.traceId && group.spans.some((span) => span.spanId === selectedSpan.spanId),
    )
    if (!isVisible) onSelectSpan(null)
  }, [filteredGroups, isLoading, isLoadingSpans, onSelectSpan, selectedSpan])

  useEffect(() => {
    if (!selectedSpan || groups.length === 0) return
    requestAnimationFrame(() => {
      scrollSpanIntoView(treeContainerRef.current, selectedSpan.spanId, selectedSpan.traceId)
    })
  }, [groups.length, selectedSpan])

  // TODO(frontend-use-effect-policy): keep loading empty pages until spans match the current filters or pagination ends.
  useEffect(() => {
    if (isLoading || isLoadingMore || !traceQuery.hasNextPage) return
    if (!spans || spans.length === 0 || filteredGroups.length === 0) loadMoreTraces()
  }, [filteredGroups.length, isLoading, isLoadingMore, loadMoreTraces, spans, traceQuery.hasNextPage])

  function handleSelectSpan(selection: SpanTreeSelection | null) {
    if (!selection || (selectedSpan && spanSelectionKey(selection) === spanSelectionKey(selectedSpan))) {
      onSelectSpan(null)
      return
    }
    onSelectSpan(selection)
  }

  function handleOpenTrace(traceId: string) {
    onSelectSpan(null)
    onOpenTrace(traceId, { targetTab: "trace" })
  }

  const paginationStatus = (
    <div className="flex shrink-0 items-center justify-center border-t px-4 py-3">
      <Text.H6 color="foregroundMuted">
        Showing spans from {loadedTraceIds.length} of {session.traceCount} traces
        {!traceQuery.hasNextPage && loadedTraceIds.length < session.traceCount ? " (display limit reached)" : ""}
        {isLoadingMore ? " · Loading…" : ""}
      </Text.H6>
    </div>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">Loading spans...</Text.H5>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">Unable to load spans</Text.H5>
      </div>
    )
  }

  if (!spans || spans.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 items-center justify-center py-6">
          <Text.H5 color="foregroundMuted">No spans found</Text.H5>
        </div>
        {paginationStatus}
      </div>
    )
  }

  if (filteredGroups.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SpanFiltersBar
          spans={spans}
          filters={filters}
          onToggleErrors={toggleErrors}
          onToggleTools={toggleTools}
          onToggleMemory={toggleMemory}
          onSelectModel={selectModel}
          onClearFilters={clearFilters}
        />
        <div className="flex flex-1 items-center justify-center py-6">
          <Text.H5 color="foregroundMuted">No spans match the active filters</Text.H5>
        </div>
        {paginationStatus}
      </div>
    )
  }

  const selectedGroup = selectedSpan ? groups.find((group) => group.traceId === selectedSpan.traceId) : undefined

  return (
    <div ref={treeContainerRef} className="flex flex-1 flex-col overflow-hidden">
      <SpanFiltersBar
        spans={spans}
        filters={filters}
        onToggleErrors={toggleErrors}
        onToggleTools={toggleTools}
        onToggleMemory={toggleMemory}
        onSelectModel={selectModel}
        onClearFilters={clearFilters}
      />
      <GroupedSpanTree
        groups={filteredGroups.map((group) => ({
          traceId: group.traceId,
          spans: group.spans,
          timeRange: timeRangeByTraceId.get(group.traceId),
          header: {
            label: <Text.H6B noWrap>Trace {traceNumberById.get(group.traceId)}</Text.H6B>,
            meta: (
              <>
                <Text.H6 color="foregroundMuted" noWrap>
                  {new Date(group.startTime).toLocaleString()}
                </Text.H6>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleOpenTrace(group.traceId)}
                >
                  View trace
                  <Icon icon={ArrowUpRightIcon} size="xs" />
                </Button>
              </>
            ),
          },
        }))}
        selectedSpan={selectedSpan}
        onSelectSpan={handleSelectSpan}
        isActive={isActive}
        footer={paginationStatus}
        onScrollEnd={loadMoreTraces}
      />
      {selectedSpan && selectedGroup && (
        <SpanDetail
          projectId={projectId}
          traceId={selectedSpan.traceId}
          spanId={selectedSpan.spanId}
          startTimeFrom={selectedGroup.startTime}
          startTimeTo={selectedGroup.endTime}
          onClose={() => handleSelectSpan(null)}
        />
      )}
    </div>
  )
}
