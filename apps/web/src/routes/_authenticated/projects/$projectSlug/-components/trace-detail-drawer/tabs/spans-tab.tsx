import { Text } from "@repo/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSpansByTraceCollection } from "../../../../../../../domains/spans/spans.collection.ts"
import { SpanDetail } from "./spans-tab/span-detail/index.tsx"
import { filterSpansWithAncestors } from "./spans-tab/span-filters.ts"
import { SpanFiltersBar } from "./spans-tab/span-filters-bar.tsx"
import { SpanTree, scrollSpanIntoView } from "./spans-tab/span-tree/index.tsx"
import { useSpanFilters } from "./spans-tab/use-span-filters.ts"

export function SpansTab({
  projectId,
  traceId,
  startTimeFrom,
  startTimeTo,
  selectedSpanId,
  onSelectSpan,
  isActive,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
  readonly selectedSpanId: string
  readonly onSelectSpan: (spanId: string) => void
  readonly isActive: boolean
}) {
  const { filters, clearFilters, toggleErrors, toggleTools, toggleSubagents, selectModel } = useSpanFilters()
  // Shares the cached spans collection with the Trace tab's fetch (same key → one fetch).
  const { data: spans, isLoading } = useSpansByTraceCollection({ projectId, traceId, startTimeFrom, startTimeTo })
  const [isMinimized, setIsMinimized] = useState(() => selectedSpanId !== "")
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const filteredSpans = useMemo(() => (spans ? filterSpansWithAncestors(spans, filters) : []), [filters, spans])

  // TODO(frontend-use-effect-policy): clear selection when the active filter set
  // hides the currently selected span.
  useEffect(() => {
    if (!selectedSpanId || filteredSpans.length === 0) return
    const isVisible = filteredSpans.some((span) => span.spanId === selectedSpanId)
    if (!isVisible) onSelectSpan("")
  }, [filteredSpans, onSelectSpan, selectedSpanId])

  // TODO(frontend-use-effect-policy): scrollSpanIntoView is an imperative DOM
  // operation that cannot be derived during render. It must fire both when
  // selectedSpanId changes externally (navigation from conversation tab) and
  // when spans first load with a pre-set selectedSpanId, so an event handler
  // alone is not sufficient.
  useEffect(() => {
    if (!selectedSpanId || !spans || spans.length === 0) return
    setIsMinimized(true)
    requestAnimationFrame(() => {
      scrollSpanIntoView(treeContainerRef.current, selectedSpanId)
    })
  }, [selectedSpanId, spans?.length])

  function handleSelectSpan(spanId: string) {
    if (spanId === "" || spanId === selectedSpanId) {
      onSelectSpan("")
      setIsMinimized(false)
      return
    }
    onSelectSpan(spanId)
  }

  function handleCloseDetail() {
    onSelectSpan("")
    setIsMinimized(false)
  }

  function handleToggleMinimized() {
    setIsMinimized((prev) => !prev)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">Loading spans...</Text.H5>
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

  if (filteredSpans.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SpanFiltersBar
          spans={spans}
          filters={filters}
          onToggleErrors={toggleErrors}
          onToggleTools={toggleTools}
          onToggleSubagents={toggleSubagents}
          onSelectModel={selectModel}
          onClearFilters={clearFilters}
        />
        <div className="flex flex-1 items-center justify-center py-6">
          <Text.H5 color="foregroundMuted">No spans match the active filters</Text.H5>
        </div>
      </div>
    )
  }

  return (
    <div ref={treeContainerRef} className="flex flex-col flex-1 overflow-hidden">
      <SpanFiltersBar
        spans={spans}
        filters={filters}
        onToggleErrors={toggleErrors}
        onToggleTools={toggleTools}
        onToggleSubagents={toggleSubagents}
        onSelectModel={selectModel}
        onClearFilters={clearFilters}
      />
      <SpanTree
        spans={filteredSpans}
        selectedSpanId={selectedSpanId}
        onSelectSpan={handleSelectSpan}
        isMinimized={isMinimized && selectedSpanId !== ""}
        onToggleMinimized={handleToggleMinimized}
        isActive={isActive}
      />
      {selectedSpanId !== "" && (
        <SpanDetail
          projectId={projectId}
          traceId={traceId}
          spanId={selectedSpanId}
          startTimeFrom={startTimeFrom}
          startTimeTo={startTimeTo}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  )
}
