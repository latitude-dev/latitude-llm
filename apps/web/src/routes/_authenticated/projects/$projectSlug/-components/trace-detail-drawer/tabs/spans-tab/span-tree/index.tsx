import { cn, Text, Tooltip } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ChevronsDownUpIcon, ChevronsUpDownIcon, MaximizeIcon, MinimizeIcon } from "lucide-react"
import { type ReactNode, useMemo, useRef, useState } from "react"
import { HotkeyBadge } from "../../../../../../../../../components/hotkey-badge.tsx"
import type { SpanRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import {
  getAdjacentSpanSelection,
  type SpanTreeSelection,
  spanTreeSelectionKey,
  toggleCollapsedSpan,
} from "./grouped-tree-state.ts"
import {
  MIN_TREE_WIDTH,
  MIN_WATERFALL_WIDTH,
  MINIMIZED_MAX_HEIGHT,
  ROW_HEIGHT,
  WATERFALL_H_INSET_PX,
} from "./helpers.ts"
import { TreeRow } from "./tree-row.tsx"
import { buildSpanTree, flattenTree, formatDuration, getTraceTimeRange, type TraceTimeRange } from "./tree-utils.ts"
import { useResizablePanel } from "./use-resizable-panel.ts"
import { useWaterfallCursor, WaterfallCursorOverlay } from "./waterfall.tsx"

export type { SpanTreeSelection } from "./grouped-tree-state.ts"

export interface SpanTreeGroup {
  readonly traceId: string
  readonly spans: readonly SpanRecord[]
  readonly timeRange?: TraceTimeRange | undefined
  readonly header?: ReactNode
}

function collectCollapsibleIds(roots: ReturnType<typeof buildSpanTree>): Set<string> {
  const ids = new Set<string>()
  const visited = new Set<string>()

  function collect(node: (typeof roots)[number]) {
    if (visited.has(node.span.spanId)) return
    visited.add(node.span.spanId)
    if (node.children.length > 0) ids.add(node.span.spanId)
    for (const child of node.children) collect(child)
  }

  for (const root of roots) collect(root)
  return ids
}

function SpanTreeGroupRows({
  group,
  visibleNodes,
  collapsed,
  selectedSpan,
  onToggle,
  onSelectSpan,
  treeWidth,
  timeRange,
  showControls,
  hasCollapsible,
  isAllCollapsed,
  onToggleAll,
  isMinimized,
  onToggleMinimized,
}: {
  readonly group: SpanTreeGroup
  readonly visibleNodes: ReturnType<typeof flattenTree>
  readonly collapsed: ReadonlySet<string>
  readonly selectedSpan: SpanTreeSelection | null
  readonly onToggle: (spanId: string) => void
  readonly onSelectSpan: (selection: SpanTreeSelection | null) => void
  readonly treeWidth: number
  readonly timeRange: TraceTimeRange
  readonly showControls: boolean
  readonly hasCollapsible: boolean
  readonly isAllCollapsed: boolean
  readonly onToggleAll: () => void
  readonly isMinimized: boolean
  readonly onToggleMinimized: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { cursorX, cursorTimeLabel, onMouseMove, onMouseLeave } = useWaterfallCursor({
    containerRef,
    treeWidth,
    timeRange,
  })

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: passive mouse tracking for waterfall cursor
    <div ref={containerRef} className="relative flex flex-col" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <div className="flex shrink-0 flex-row items-center border-b border-border" style={{ height: ROW_HEIGHT }}>
        <div className="flex shrink-0 flex-row items-center gap-1 px-2" style={{ width: treeWidth }}>
          {showControls ? (
            <Tooltip side="bottom" trigger={<Text.H6 color="foregroundMuted">Span</Text.H6>}>
              Navigate <HotkeyBadge hotkey="J" /> <HotkeyBadge hotkey="K" /> · Deselect <HotkeyBadge hotkey="Escape" />
            </Tooltip>
          ) : (
            <Text.H6 color="foregroundMuted">Span</Text.H6>
          )}
          {showControls && hasCollapsible && (
            <Tooltip
              asChild
              side="bottom"
              trigger={
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted"
                  onClick={onToggleAll}
                >
                  {isAllCollapsed ? (
                    <ChevronsUpDownIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronsDownUpIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              }
            >
              {isAllCollapsed ? "Expand all" : "Collapse all"} <HotkeyBadge hotkey="E" />
            </Tooltip>
          )}
          {showControls && selectedSpan && (
            <Tooltip
              asChild
              side="bottom"
              trigger={
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted"
                  onClick={onToggleMinimized}
                >
                  {isMinimized ? <MaximizeIcon className="h-3.5 w-3.5" /> : <MinimizeIcon className="h-3.5 w-3.5" />}
                </button>
              }
            >
              {isMinimized ? "Expand tree" : "Minimize tree"}
            </Tooltip>
          )}
        </div>
        <div className="w-px shrink-0 self-stretch bg-border" />
        <div
          className="flex min-w-0 flex-1 flex-row items-center justify-between"
          style={{ paddingLeft: WATERFALL_H_INSET_PX, paddingRight: WATERFALL_H_INSET_PX }}
        >
          <Text.H6 color="foregroundMuted">0ms</Text.H6>
          <Text.H6 color="foregroundMuted">{formatDuration(timeRange.totalDuration)}</Text.H6>
        </div>
      </div>

      {visibleNodes.map((flatNode) => {
        const spanId = flatNode.node.span.spanId
        const selection = { traceId: group.traceId, spanId }
        return (
          <TreeRow
            key={spanTreeSelectionKey(selection)}
            traceId={group.traceId}
            flatNode={flatNode}
            isExpanded={!collapsed.has(spanId)}
            isSelected={selectedSpan ? spanTreeSelectionKey(selectedSpan) === spanTreeSelectionKey(selection) : false}
            onToggle={onToggle}
            onSelect={(nextSpanId) => onSelectSpan({ traceId: group.traceId, spanId: nextSpanId })}
            treeWidth={treeWidth}
            timeRange={timeRange}
          />
        )
      })}

      <WaterfallCursorOverlay treeWidth={treeWidth} cursorX={cursorX} cursorTimeLabel={cursorTimeLabel} />
    </div>
  )
}

export function GroupedSpanTree({
  groups,
  selectedSpan,
  onSelectSpan,
  isMinimized,
  onToggleMinimized,
  isActive,
}: {
  readonly groups: readonly SpanTreeGroup[]
  readonly selectedSpan: SpanTreeSelection | null
  readonly onSelectSpan: (selection: SpanTreeSelection | null) => void
  readonly isMinimized: boolean
  readonly onToggleMinimized: () => void
  readonly isActive: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { treeWidth, isDragging, onPointerDown, onKeyDown } = useResizablePanel({ containerRef })
  const resolvedTreeWidth = treeWidth ?? MIN_TREE_WIDTH

  const preparedGroups = useMemo(
    () =>
      groups.map((group) => {
        const roots = buildSpanTree(group.spans)
        const groupCollapsed = new Set(
          [...collapsed]
            .filter((key) => key.startsWith(`${group.traceId}:`))
            .map((key) => key.slice(group.traceId.length + 1)),
        )
        return {
          group,
          collapsed: groupCollapsed,
          visibleNodes: flattenTree(roots, groupCollapsed),
          collapsibleIds: collectCollapsibleIds(roots),
          timeRange: group.timeRange ?? getTraceTimeRange(group.spans),
        }
      }),
    [collapsed, groups],
  )

  const visibleSelections = preparedGroups.flatMap(({ group, visibleNodes }) =>
    visibleNodes.map(({ node }) => ({ traceId: group.traceId, spanId: node.span.spanId })),
  )
  const collapsibleSelections = preparedGroups.flatMap(({ group, collapsibleIds }) =>
    [...collapsibleIds].map((spanId) => spanTreeSelectionKey({ traceId: group.traceId, spanId })),
  )
  const isAllCollapsed = collapsibleSelections.length > 0 && collapsibleSelections.every((key) => collapsed.has(key))

  function toggle(selection: SpanTreeSelection) {
    setCollapsed((current) => toggleCollapsedSpan(current, selection))
  }

  function toggleAll() {
    setCollapsed(isAllCollapsed ? new Set() : new Set(collapsibleSelections))
  }

  useHotkeys([
    {
      hotkey: "J",
      callback: () => {
        const next = getAdjacentSpanSelection(visibleSelections, selectedSpan, "next")
        if (next) onSelectSpan(next)
      },
      options: { enabled: isActive },
    },
    {
      hotkey: "K",
      callback: () => {
        const previous = getAdjacentSpanSelection(visibleSelections, selectedSpan, "previous")
        if (previous) onSelectSpan(previous)
      },
      options: { enabled: isActive },
    },
    {
      hotkey: "E",
      callback: toggleAll,
      options: { enabled: isActive },
    },
    {
      hotkey: "Escape",
      callback: () => onSelectSpan(null),
      options: { enabled: isActive && selectedSpan !== null, ignoreInputs: true },
    },
  ])

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-col overflow-hidden",
        isMinimized ? "shrink-0 border-b border-border" : "flex-1",
      )}
      style={isMinimized ? { maxHeight: MINIMIZED_MAX_HEIGHT } : undefined}
    >
      <div className="flex flex-1 flex-col overflow-y-auto">
        {preparedGroups.map(({ group, visibleNodes, collapsed: groupCollapsed, timeRange }, index) => (
          <div key={group.traceId} className="flex shrink-0 flex-col">
            {group.header}
            <SpanTreeGroupRows
              group={group}
              visibleNodes={visibleNodes}
              collapsed={groupCollapsed}
              selectedSpan={selectedSpan}
              onToggle={(spanId) => toggle({ traceId: group.traceId, spanId })}
              onSelectSpan={onSelectSpan}
              treeWidth={resolvedTreeWidth}
              timeRange={timeRange}
              showControls={index === 0}
              hasCollapsible={collapsibleSelections.length > 0}
              isAllCollapsed={isAllCollapsed}
              onToggleAll={toggleAll}
              isMinimized={isMinimized}
              onToggleMinimized={onToggleMinimized}
            />
          </div>
        ))}
      </div>

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
          "absolute bottom-0 top-0 z-10 w-px cursor-col-resize touch-none",
          "transition-colors hover:bg-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
          "before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-['']",
          { "bg-primary": isDragging, "bg-border": !isDragging },
        )}
        style={{ left: resolvedTreeWidth }}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

export function SpanTree({
  spans,
  selectedSpanId,
  onSelectSpan,
  isMinimized,
  onToggleMinimized,
  isActive,
}: {
  readonly spans: readonly SpanRecord[]
  readonly selectedSpanId: string
  readonly onSelectSpan: (spanId: string) => void
  readonly isMinimized: boolean
  readonly onToggleMinimized: () => void
  readonly isActive: boolean
}) {
  const traceId = spans[0]?.traceId ?? ""
  const selectedSpan = selectedSpanId ? { traceId, spanId: selectedSpanId } : null
  return (
    <GroupedSpanTree
      groups={[{ traceId, spans }]}
      selectedSpan={selectedSpan}
      onSelectSpan={(selection) => onSelectSpan(selection?.spanId ?? "")}
      isMinimized={isMinimized}
      onToggleMinimized={onToggleMinimized}
      isActive={isActive}
    />
  )
}

export function scrollSpanIntoView(containerEl: HTMLElement | null, spanId: string, traceId?: string) {
  if (!containerEl) return
  const row = [...containerEl.querySelectorAll<HTMLElement>("[data-span-id]")].find(
    (element) => element.dataset.spanId === spanId && (traceId === undefined || element.dataset.traceId === traceId),
  )
  row?.scrollIntoView({ block: "nearest", behavior: "smooth" })
}
