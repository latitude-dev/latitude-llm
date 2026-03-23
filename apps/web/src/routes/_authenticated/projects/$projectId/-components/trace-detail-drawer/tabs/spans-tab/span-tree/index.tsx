import { cn, Text } from "@repo/ui"
import { ChevronsDownUpIcon, ChevronsUpDownIcon, MaximizeIcon, MinimizeIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import type { SpanRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { MIN_TREE_WIDTH, MIN_WATERFALL_WIDTH, MINIMIZED_MAX_HEIGHT, ROW_HEIGHT } from "./helpers.ts"
import { TreeRow } from "./tree-row.tsx"
import { buildSpanTree, flattenTree, formatDuration, getTraceTimeRange } from "./tree-utils.ts"
import { useResizablePanel } from "./use-resizable-panel.ts"
import { useWaterfallCursor, WaterfallCursorOverlay } from "./waterfall.tsx"

export function SpanTree({
  spans,
  selectedSpanId,
  onSelectSpan,
  isMinimized,
  onToggleMinimized,
}: {
  readonly spans: readonly SpanRecord[]
  readonly selectedSpanId: string | null
  readonly onSelectSpan: (spanId: string) => void
  readonly isMinimized: boolean
  readonly onToggleMinimized: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { treeWidth, isDragging, onDragStart } = useResizablePanel({ containerRef })

  const roots = useMemo(() => buildSpanTree(spans), [spans])
  const timeRange = useMemo(() => getTraceTimeRange(spans), [spans])
  const visibleNodes = useMemo(() => flattenTree(roots, collapsed), [roots, collapsed])

  const collapsibleIds = useMemo(() => {
    const ids = new Set<string>()
    function collect(node: { span: { spanId: string }; children: readonly unknown[] }) {
      if (node.children.length > 0) ids.add(node.span.spanId)
      for (const child of node.children) collect(child as typeof node)
    }
    for (const root of roots) collect(root)
    return ids
  }, [roots])

  const isAllCollapsed = collapsibleIds.size > 0 && collapsibleIds.size === collapsed.size

  const resolvedTreeWidth = treeWidth ?? MIN_TREE_WIDTH
  const { cursorX, cursorTimeLabel, onMouseMove, onMouseLeave } = useWaterfallCursor({
    containerRef,
    treeWidth: resolvedTreeWidth,
    timeRange,
  })

  const toggle = useCallback((spanId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(spanId)) next.delete(spanId)
      else next.add(spanId)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setCollapsed((prev) => (prev.size > 0 ? new Set() : new Set(collapsibleIds)))
  }, [collapsibleIds])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: passive mouse tracking for waterfall cursor
    <div
      ref={containerRef}
      className={cn("relative flex flex-col overflow-hidden", isMinimized ? "shrink-0" : "flex-1")}
      style={isMinimized ? { maxHeight: MINIMIZED_MAX_HEIGHT } : undefined}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="flex flex-row items-center shrink-0 border-b border-border" style={{ height: ROW_HEIGHT }}>
        <div className="flex flex-row items-center gap-1 shrink-0 px-2" style={{ width: resolvedTreeWidth }}>
          <Text.H6 color="foregroundMuted">Span</Text.H6>
          {collapsibleIds.size > 0 && (
            <button
              type="button"
              className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground transition-colors"
              onClick={toggleAll}
              title={isAllCollapsed ? "Expand all" : "Collapse all"}
            >
              {isAllCollapsed ? (
                <ChevronsUpDownIcon className="w-3.5 h-3.5" />
              ) : (
                <ChevronsDownUpIcon className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {selectedSpanId && (
            <button
              type="button"
              className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground transition-colors"
              onClick={onToggleMinimized}
              title={isMinimized ? "Expand tree" : "Minimize tree"}
            >
              {isMinimized ? <MaximizeIcon className="w-3.5 h-3.5" /> : <MinimizeIcon className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        <div className="shrink-0 w-px self-stretch bg-border" />
        <div className="flex-1 flex flex-row items-center justify-between px-2">
          <Text.H6 color="foregroundMuted">0ms</Text.H6>
          <Text.H6 color="foregroundMuted">{formatDuration(timeRange.totalDuration)}</Text.H6>
        </div>
      </div>

      {/* Rows */}
      <div ref={scrollRef} className="flex flex-col overflow-y-auto flex-1">
        {visibleNodes.map((flatNode) => (
          <TreeRow
            key={flatNode.node.span.spanId}
            flatNode={flatNode}
            isExpanded={!collapsed.has(flatNode.node.span.spanId)}
            isSelected={selectedSpanId === flatNode.node.span.spanId}
            onToggle={toggle}
            onSelect={onSelectSpan}
            treeWidth={resolvedTreeWidth}
            timeRange={timeRange}
          />
        ))}
      </div>

      {/* Waterfall time cursor */}
      <WaterfallCursorOverlay treeWidth={resolvedTreeWidth} cursorX={cursorX} cursorTimeLabel={cursorTimeLabel} />

      {/* Resize handle */}
      {/* biome-ignore lint/a11y/useSemanticElements: resize handle requires div for drag events */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize span tree panel"
        aria-valuenow={resolvedTreeWidth}
        aria-valuemin={MIN_TREE_WIDTH}
        aria-valuemax={containerRef.current ? containerRef.current.offsetWidth - MIN_WATERFALL_WIDTH : 9999}
        tabIndex={0}
        className={cn(
          "absolute top-0 bottom-0 w-px cursor-col-resize z-10",
          "hover:bg-primary transition-colors",
          "before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-['']",
          isDragging ? "bg-primary" : "bg-border",
        )}
        style={{ left: resolvedTreeWidth }}
        onMouseDown={onDragStart}
      />
    </div>
  )
}

export function scrollSpanIntoView(containerEl: HTMLElement | null, spanId: string) {
  if (!containerEl) return
  const row = containerEl.querySelector(`[data-span-id="${spanId}"]`)
  if (row) {
    row.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }
}
