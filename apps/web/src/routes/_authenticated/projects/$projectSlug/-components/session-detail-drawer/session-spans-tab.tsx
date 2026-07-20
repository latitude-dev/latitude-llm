import { Button, Icon, Text } from "@repo/ui"
import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { useSpansBySessionCollection } from "../../../../../../domains/spans/spans.collection.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
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
  getSessionTraceNumberById,
  groupSessionSpans,
  resolveSpanTraceId,
  spanSelectionKey,
} from "./session-spans.ts"

export function SessionSpansTab({
  projectId,
  session,
  traces,
  selectedSpanId,
  selectedSpanTraceId,
  onSelectSpan,
  onOpenTrace,
  isActive,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly traces: readonly TraceRecord[]
  readonly selectedSpanId: string
  readonly selectedSpanTraceId: string
  readonly onSelectSpan: (selection: SpanTreeSelection | null) => void
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
  readonly isActive: boolean
}) {
  const { filters, clearFilters, toggleErrors, toggleTools, toggleMemory, selectModel } = useSpanFilters()
  const {
    data: spans,
    isLoading,
    isError,
  } = useSpansBySessionCollection({
    projectId,
    sessionId: session.sessionId,
    traceIds: session.traceIds,
    startTimeFrom: session.startTime,
    startTimeTo: session.endTime,
  })
  const [isMinimized, setIsMinimized] = useState(() => selectedSpanId !== "")
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const groups = useMemo(() => groupSessionSpans(spans ?? [], traces), [spans, traces])
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

  // TODO(frontend-use-effect-policy): legacy span links only stored spanId; resolve their trace after spans load.
  useEffect(() => {
    if (!selectedSpanId || selectedSpanTraceId || isLoading) return
    const resolved = resolveSpanTraceId(groups, selectedSpanId)
    if (resolved.traceId) onSelectSpan({ traceId: resolved.traceId, spanId: selectedSpanId })
    else if (resolved.ambiguous || groups.length > 0) onSelectSpan(null)
  }, [groups, isLoading, onSelectSpan, selectedSpanId, selectedSpanTraceId])

  // TODO(frontend-use-effect-policy): active filters can remove a URL-selected span from the rendered trees.
  // Gate on `isLoading`: while the spans are still in flight `filteredGroups` is empty, which would
  // otherwise read as "filtered out" and clear a freshly-selected span before its trees exist.
  useEffect(() => {
    if (!selectedSpan || isLoading) return
    const isVisible = filteredGroups.some(
      (group) =>
        group.traceId === selectedSpan.traceId && group.spans.some((span) => span.spanId === selectedSpan.spanId),
    )
    if (!isVisible) {
      onSelectSpan(null)
      setIsMinimized(false)
    }
  }, [filteredGroups, isLoading, onSelectSpan, selectedSpan])

  // TODO(frontend-use-effect-policy): external conversation/deep-link selection needs imperative scrolling after load.
  useEffect(() => {
    if (!selectedSpan || groups.length === 0) return
    setIsMinimized(true)
    requestAnimationFrame(() => {
      scrollSpanIntoView(treeContainerRef.current, selectedSpan.spanId, selectedSpan.traceId)
    })
  }, [groups.length, selectedSpan])

  function handleSelectSpan(selection: SpanTreeSelection | null) {
    if (!selection || (selectedSpan && spanSelectionKey(selection) === spanSelectionKey(selectedSpan))) {
      onSelectSpan(null)
      setIsMinimized(false)
      return
    }
    onSelectSpan(selection)
  }

  function handleOpenTrace(traceId: string) {
    onSelectSpan(null)
    setIsMinimized(false)
    onOpenTrace(traceId, { targetTab: "trace" })
  }

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
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">No spans found</Text.H5>
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
        isMinimized={isMinimized && selectedSpan !== null}
        onToggleMinimized={() => setIsMinimized((current) => !current)}
        isActive={isActive}
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
