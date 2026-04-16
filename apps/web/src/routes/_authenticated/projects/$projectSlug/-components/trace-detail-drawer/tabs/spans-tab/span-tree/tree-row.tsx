import { cn, Text } from "@repo/ui"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { memo } from "react"
import { INDENT_PX, ROW_HEIGHT, statusTextColor, WATERFALL_H_INSET_PX } from "./helpers.ts"
import { SpanIcon } from "./span-icon.tsx"
import type { FlattenedNode, TraceTimeRange } from "./tree-utils.ts"
import { formatDuration } from "./tree-utils.ts"
import { WaterfallBar } from "./waterfall.tsx"

function TreeConnectors({
  connectors,
  isLastChild,
  depth,
}: {
  readonly connectors: readonly boolean[]
  readonly isLastChild: boolean
  readonly depth: number
}) {
  if (depth === 0) return null

  return (
    <div className="flex flex-row shrink-0 h-full">
      {connectors.slice(0, -1).map((continues, i) => (
        <div key={i} className="relative shrink-0" style={{ width: INDENT_PX, height: ROW_HEIGHT }}>
          {continues && <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />}
        </div>
      ))}
      <div className="relative shrink-0" style={{ width: INDENT_PX, height: ROW_HEIGHT }}>
        <div className={cn("absolute left-[7px] top-0 w-px bg-border", isLastChild ? "h-1/2" : "bottom-0")} />
        <div className="absolute left-[7px] top-1/2 w-[9px] h-px bg-border" />
      </div>
    </div>
  )
}

export const TreeRow = memo(function TreeRow({
  flatNode,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  treeWidth,
  timeRange,
}: {
  readonly flatNode: FlattenedNode
  readonly isExpanded: boolean
  readonly isSelected: boolean
  readonly onToggle: (spanId: string) => void
  readonly onSelect: (spanId: string) => void
  readonly treeWidth: number
  readonly timeRange: TraceTimeRange
}) {
  const { node, connectors, isLastChild } = flatNode
  const hasChildren = node.children.length > 0
  const durationMs = new Date(node.span.endTime).getTime() - new Date(node.span.startTime).getTime()

  return (
    // biome-ignore lint/a11y/useSemanticElements: div with role="button" avoids invalid nested <button> elements
    <div
      role="button"
      tabIndex={0}
      data-span-id={node.span.spanId}
      className={cn(
        "flex flex-row items-center shrink-0 cursor-pointer transition-colors",
        isSelected ? "bg-accent" : "hover:bg-muted/50",
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(node.span.spanId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(node.span.spanId)
        }
      }}
    >
      <div
        className="flex flex-row items-center gap-1 shrink-0 min-w-0 h-full"
        style={{ paddingLeft: node.depth === 0 ? 8 : 0, paddingRight: 8, width: treeWidth }}
      >
        <TreeConnectors connectors={connectors} isLastChild={isLastChild} depth={node.depth} />

        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 p-0.5 rounded hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.span.spanId)
            }}
          >
            {isExpanded ? (
              <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <SpanIcon span={node.span} />

        <Text.H6 noWrap ellipsis className="flex-1 min-w-0">
          {node.span.name}
        </Text.H6>

        <Text.H6 color={statusTextColor(node.span.statusCode)} className="shrink-0">
          {formatDuration(durationMs)}
        </Text.H6>
      </div>

      <div className="flex-1 relative h-full min-w-0">
        <div className="absolute inset-y-0 min-w-0" style={{ left: WATERFALL_H_INSET_PX, right: WATERFALL_H_INSET_PX }}>
          <WaterfallBar span={node.span} timeRange={timeRange} />
        </div>
      </div>
    </div>
  )
})
