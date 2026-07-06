import { InfiniteTable, type InfiniteTableColumn, Text, Tooltip } from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { Link, useNavigate } from "@tanstack/react-router"
import { WrenchIcon } from "lucide-react"
import { useCallback, useMemo } from "react"
import { useListRowKeyboardNav } from "../../../../../../lib/hooks/useListRowKeyboardNav.ts"
import type { ToolSummaryRecord } from "../../../../../../domains/tools/tools.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { formatPercent, TOOL_FAILING_ERROR_RATE } from "./tool-formatters.ts"
import { ToolStatusBadges } from "./tool-status-badges.tsx"
import { ToolTrendBar } from "./tool-trend-bar.tsx"

export const TOOLS_COLUMN_OPTIONS = [
  { id: "tool", label: "Tool", required: true },
  { id: "trend", label: "Trend" },
  { id: "calls", label: "Calls" },
  { id: "tracesPct", label: "% of traces" },
  { id: "selectionRate", label: "Calls per offer" },
  { id: "offered", label: "Offered" },
  { id: "errorRate", label: "Error rate" },
  { id: "duration", label: "Duration" },
  { id: "lastCalled", label: "Last called" },
] as const

export type ToolsColumnId = (typeof TOOLS_COLUMN_OPTIONS)[number]["id"]

export interface ToolsTableSorting {
  readonly column: "calls" | "tracesPct" | "selectionRate" | "offered" | "errorRate" | "duration" | "lastCalled"
  readonly direction: "asc" | "desc"
}

export const DEFAULT_TOOLS_SORTING: ToolsTableSorting = { column: "calls", direction: "desc" }

const SORT_BY_CALLS = (tool: ToolSummaryRecord): number => tool.metrics?.calls ?? -1

// A Map (not a plain object) so a sort column that somehow escaped URL-param
// validation looks up nothing instead of dispatching to an Object.prototype
// member (CodeQL js/unvalidated-dynamic-method-call).
const SORT_VALUE = new Map<ToolsTableSorting["column"], (tool: ToolSummaryRecord) => number>([
  ["calls", SORT_BY_CALLS],
  ["tracesPct", (tool) => tool.metrics?.traceUsageRate ?? -1],
  ["selectionRate", (tool) => tool.selectionRate ?? -1],
  ["offered", (tool) => tool.offeredCount],
  ["errorRate", (tool) => tool.metrics?.errorRate ?? -1],
  ["duration", (tool) => tool.metrics?.p95DurationNs ?? -1],
  ["lastCalled", (tool) => (tool.metrics ? Date.parse(tool.metrics.lastUsed) : -1)],
])

/** Client-side sort — the whole list is loaded in one query. */
export function sortTools(
  tools: readonly ToolSummaryRecord[],
  sorting: ToolsTableSorting,
): readonly ToolSummaryRecord[] {
  const getValue = SORT_VALUE.get(sorting.column) ?? SORT_BY_CALLS
  const sign = sorting.direction === "asc" ? 1 : -1
  return [...tools].sort((a, b) => {
    const diff = (getValue(a) - getValue(b)) * sign
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}

export function ToolsView({
  tools,
  isLoading,
  sorting,
  callsSum,
  visibleColumnIds,
  onSortChange,
  projectSlug,
  rangeFromIso,
  rangeToIso,
  trendBucketSeconds,
  focusedToolName,
  onFocusedToolChange,
  keyboardNavEnabled = true,
}: {
  readonly tools: readonly ToolSummaryRecord[]
  readonly isLoading: boolean
  readonly sorting: ToolsTableSorting
  readonly callsSum: number
  readonly visibleColumnIds: readonly ToolsColumnId[]
  readonly onSortChange: (sorting: ToolsTableSorting) => void
  readonly projectSlug: string
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly trendBucketSeconds: number
  readonly focusedToolName?: string | undefined
  readonly onFocusedToolChange?: (toolName: string | undefined) => void
  readonly keyboardNavEnabled?: boolean
}) {
  const navigate = useNavigate()
  const toolNames = useMemo(() => tools.map((tool) => tool.name), [tools])

  const openTool = useCallback(
    (toolName: string) => {
      void navigate({ to: "/projects/$projectSlug/tools/$toolName", params: { projectSlug, toolName } })
    },
    [navigate, projectSlug],
  )

  useListRowKeyboardNav({
    rowIds: toolNames,
    focusedRowId: focusedToolName,
    onFocusedRowChange: (toolName) => onFocusedToolChange?.(toolName),
    onOpenRow: openTool,
    enabled: keyboardNavEnabled,
  })
  const allColumns: readonly InfiniteTableColumn<ToolSummaryRecord>[] = [
    {
      key: "tool",
      header: "Tool",
      width: 320,
      minWidth: 240,
      render: (tool) => (
        <div className="flex min-w-0 items-center gap-2">
          <WrenchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Tooltip
            asChild
            trigger={
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={tool.name}>
                {tool.name}
              </span>
            }
          >
            {tool.name}
          </Tooltip>
          <ToolStatusBadges tool={tool} />
        </div>
      ),
    },
    {
      key: "trend",
      header: "Trend",
      width: 176,
      minWidth: 176,
      render: (tool) => (
        // The sparkline's positioned spans paint above the row's stretched
        // link and would swallow clicks — wrap it in its own link so clicking
        // the trend also opens the tool.
        <Link
          to="/projects/$projectSlug/tools/$toolName"
          params={{ projectSlug, toolName: tool.name }}
          className="block"
          tabIndex={-1}
          aria-hidden
        >
          <ToolTrendBar
            buckets={tool.trend}
            fromIso={rangeFromIso}
            toIso={rangeToIso}
            bucketSeconds={trendBucketSeconds}
            height={36}
          />
        </Link>
      ),
    },
    {
      key: "calls",
      header: "Calls",
      width: 76,
      minWidth: 76,
      align: "end",
      sortKey: "calls",
      render: (tool) => (tool.metrics ? formatCount(tool.metrics.calls) : "-"),
      renderSubheader: () => (
        <div className="flex min-w-0 w-full items-center justify-end gap-0.5">
          <Text.H6 color="foregroundMuted" className="min-w-0 truncate tabular-nums">
            SUM
          </Text.H6>
          <Text.H6B color="foreground">{formatCount(callsSum)}</Text.H6B>
        </div>
      ),
    },
    {
      key: "tracesPct",
      header: "% of traces",
      width: 110,
      minWidth: 96,
      align: "end",
      sortKey: "tracesPct",
      render: (tool) =>
        tool.metrics ? (
          <Tooltip
            asChild
            trigger={
              <span className="tabular-nums">
                {formatPercent(tool.metrics.traceUsageRate)} · {formatCount(tool.metrics.tracesUsed)}
              </span>
            }
          >
            {formatCount(tool.metrics.tracesUsed)} traces in this window called {tool.name} at least once.
          </Tooltip>
        ) : (
          "-"
        ),
    },
    {
      key: "selectionRate",
      header: "Calls per offer",
      width: 110,
      minWidth: 96,
      align: "end",
      sortKey: "selectionRate",
      render: (tool) =>
        tool.selectionRate !== null ? (
          <Tooltip asChild trigger={<span className="tabular-nums">{formatPercent(tool.selectionRate)}</span>}>
            How often the model picks this tool when it's available: {formatCount(tool.metrics?.calls ?? 0)} calls
            across {formatCount(tool.offeredCount)} chat turns that offered it. Can exceed 100% when a single turn calls
            it multiple times.
          </Tooltip>
        ) : (
          <Tooltip asChild trigger={<span>-</span>}>
            Calls per offer needs tool definitions on chat spans — none were found for this tool.
          </Tooltip>
        ),
    },
    {
      key: "offered",
      header: "Offered",
      width: 100,
      minWidth: 90,
      align: "end",
      sortKey: "offered",
      render: (tool) =>
        tool.offeredCount > 0 ? (
          <Tooltip asChild trigger={<span className="tabular-nums">{formatCount(tool.offeredCount)}</span>}>
            <div className="flex flex-col gap-0.5">
              <span>
                {tool.name} was offered to the model on {formatCount(tool.offeredCount)} chat turns across{" "}
                {formatCount(tool.offeredTraces)} traces.
              </span>
              {tool.lastOffered ? (
                <Text.H6 color="foregroundMuted">Last offered {relativeTime(new Date(tool.lastOffered))}</Text.H6>
              ) : null}
            </div>
          </Tooltip>
        ) : (
          <Tooltip asChild trigger={<span>-</span>}>
            No chat span in this window carried this tool's definition.
          </Tooltip>
        ),
    },
    {
      key: "errorRate",
      header: "Error rate",
      width: 110,
      minWidth: 96,
      align: "end",
      sortKey: "errorRate",
      render: (tool) =>
        tool.metrics ? (
          <Tooltip
            asChild
            trigger={
              <span
                className={`tabular-nums ${tool.metrics.errorRate >= TOOL_FAILING_ERROR_RATE ? "text-rose-600 dark:text-rose-400" : ""}`}
              >
                {formatPercent(tool.metrics.errorRate)} · {formatCount(tool.metrics.errors)}
              </span>
            }
          >
            {formatCount(tool.metrics.errors)} of {formatCount(tool.metrics.calls)} calls of {tool.name} failed.
          </Tooltip>
        ) : (
          "-"
        ),
    },
    {
      key: "duration",
      header: "Duration",
      width: 130,
      minWidth: 110,
      align: "end",
      sortKey: "duration",
      render: (tool) =>
        tool.metrics ? (
          <Tooltip
            asChild
            trigger={
              <span className="whitespace-nowrap tabular-nums">
                {formatDuration(tool.metrics.p50DurationNs)} / {formatDuration(tool.metrics.p95DurationNs)}
              </span>
            }
          >
            <div className="flex flex-col gap-0.5">
              <Text.H6 color="foregroundMuted">p50 / p95 call duration</Text.H6>
              <Text.H6B>avg {formatDuration(tool.metrics.avgDurationNs)}</Text.H6B>
            </div>
          </Tooltip>
        ) : (
          "-"
        ),
    },
    {
      key: "lastCalled",
      header: "Last called",
      width: 100,
      minWidth: 90,
      sortKey: "lastCalled",
      render: (tool) =>
        tool.metrics ? (
          <Tooltip asChild trigger={<span className="truncate">{relativeTime(new Date(tool.metrics.lastUsed))}</span>}>
            <div className="flex flex-col gap-0.5">
              <Text.H6 color="foregroundMuted">Last called at</Text.H6>
              <Text.H6B>{new Date(tool.metrics.lastUsed).toLocaleString()}</Text.H6B>
            </div>
          </Tooltip>
        ) : (
          "-"
        ),
    },
  ]

  const columnsById = new Map(allColumns.map((column) => [column.key, column]))
  const columns = visibleColumnIds.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    return column ? [column] : []
  })

  return (
    <Layout.Body>
      <Layout.List>
        <InfiniteTable
          {...listingLayoutIntrinsicScroll.infiniteTable}
          data={tools}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(tool) => tool.name}
          {...(focusedToolName ? { activeRowKey: focusedToolName, activeRowAutoScroll: true } : {})}
          renderRowLink={(tool, props) => (
            <Link
              to="/projects/$projectSlug/tools/$toolName"
              params={{ projectSlug, toolName: tool.name }}
              aria-label={`Open ${tool.name}`}
              {...props}
            />
          )}
          sorting={sorting}
          defaultSorting={DEFAULT_TOOLS_SORTING}
          onSortChange={(nextSorting) =>
            onSortChange({
              column: nextSorting.column as ToolsTableSorting["column"],
              direction: nextSorting.direction as ToolsTableSorting["direction"],
            })
          }
          blankSlate="No tools match the current filters"
        />
      </Layout.List>
    </Layout.Body>
  )
}
