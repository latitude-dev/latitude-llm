import { Input, Tabs, useValueWithDefault } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { CircleSlashIcon, LayoutGridIcon, SearchIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TimeFilterDropdown } from "../../../../../components/time-filter-dropdown.tsx"
import { allToolsMonitorTarget } from "../../../../../domains/monitors/monitor-target.ts"
import { useAnalyticsTimeWindow } from "../../../../../domains/projects/use-analytics-time-window.ts"
import { useProjectTools, useToolCallHistogram } from "../../../../../domains/tools/tools.collection.ts"
import { useProjectFirstTraceAt, useProjectLastTraceAt } from "../../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useDebounce } from "../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { useRouteProject } from "../-route-data.ts"
import { AddTargetMonitorButton } from "../monitors/-components/add-target-monitor-button.tsx"
import { getToolStatuses, pickToolTrendBucketSeconds } from "./-components/tool-formatters.ts"
import { ToolsAnalyticsPanel } from "./-components/tools-analytics-panel.tsx"
import { ToolsDiscoveryBanner } from "./-components/tools-discovery-banner.tsx"
import { ToolsEmptyState } from "./-components/tools-empty-state.tsx"
import {
  DEFAULT_TOOLS_SORTING,
  sortTools,
  TOOLS_COLUMN_OPTIONS,
  type ToolsColumnId,
  type ToolsTableSorting,
  ToolsView,
} from "./-components/tools-view.tsx"

const TOOLS_SEARCH_DEBOUNCE_MS = 300
const SORT_COLUMNS = [
  "calls",
  "tracesPct",
  "selectionRate",
  "offered",
  "errorRate",
  "duration",
  "lastCalled",
] as const satisfies readonly ToolsTableSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly ToolsTableSorting["direction"][]
const SORT_PARAM_PATTERN = /^(calls|tracesPct|selectionRate|offered|errorRate|duration|lastCalled):(asc|desc)$/

type ToolsStatusTab = "all" | "unused" | "failing"

function serializeSorting(sorting: ToolsTableSorting): string {
  return `${sorting.column}:${sorting.direction}`
}

function parseSorting(raw: string): ToolsTableSorting {
  const [rawColumn, rawDirection] = raw.split(":")
  // Return the allowlist constants rather than the user-provided strings so
  // the URL param's taint ends here (CodeQL js/unvalidated-dynamic-method-call
  // flags the sort-getter lookup otherwise).
  const column = SORT_COLUMNS.find((candidate) => candidate === rawColumn)
  const direction = SORT_DIRECTIONS.find((candidate) => candidate === rawDirection)
  if (column && direction) return { column, direction }
  return DEFAULT_TOOLS_SORTING
}

function ToolsBreadcrumb() {
  return <BreadcrumbText variant="current">Tools</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/tools/")({
  staticData: {
    breadcrumb: ToolsBreadcrumb,
  },
  component: ToolsPageContent,
})

function ToolsPageContent() {
  const project = useRouteProject()
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { firstTraceAt } = useProjectFirstTraceAt({ projectId: project.id })
  const { lastTraceAt } = useProjectLastTraceAt({ projectId: project.id })
  const tw = useAnalyticsTimeWindow({
    project,
    fromKey: "toolsTimeFrom",
    toKey: "toolsTimeTo",
    allTimeLowerBoundIso: firstTraceAt,
    lastActivityIso: lastTraceAt,
  })
  const [searchQuery, setSearchQuery] = useParamState("toolsSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [statusTab, setStatusTab] = useParamState("toolsStatus", "all", {
    validate: (value): value is ToolsStatusTab => value === "all" || value === "unused" || value === "failing",
  })
  const [rawSorting, setRawSorting] = useParamState("toolsSort", serializeSorting(DEFAULT_TOOLS_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback((next: ToolsTableSorting) => setRawSorting(serializeSorting(next)), [setRawSorting])
  const [focusedToolName, setFocusedToolName] = useState<string | undefined>()
  const columnSettings = useTableColumnSettings<ToolsColumnId>({
    storageKey: "projects.tools.columns.v1",
    columns: TOOLS_COLUMN_OPTIONS,
  })

  useDebounce(
    () => {
      const normalized = searchInput.trim()
      if (normalized !== searchQuery) {
        setSearchQuery(normalized)
      }
    },
    TOOLS_SEARCH_DEBOUNCE_MS,
    [searchInput],
  )

  // Tools' queries require a concrete lower bound, so "All time" resolves to the project's earliest
  // activity (falling back to the default window when the project has no traces yet).
  const range = useMemo(
    () => ({ fromIso: tw.listRange.fromIso ?? tw.trendRange.fromIso, toIso: tw.listRange.toIso }),
    [tw.listRange, tw.trendRange],
  )
  const trendBucketSeconds = useMemo(
    () => pickToolTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )
  // The histogram clamps to the anchored window (≤ project window, latest-activity anchored when All
  // time) so it stays consistent with the Traces/Users charts and never scans the full history per
  // bucket; the list/counts above keep the full `range`. Explicit ranges are shown in full.
  const histogramRange = useMemo(() => (tw.isAllTime ? tw.trendRange : range), [tw.isAllTime, tw.trendRange, range])
  const histogramBucketSeconds = useMemo(
    () => pickToolTrendBucketSeconds(Date.parse(histogramRange.toIso) - Date.parse(histogramRange.fromIso)),
    [histogramRange],
  )

  const { data: analytics, isLoading } = useProjectTools({ projectId: project.id, range, trendBucketSeconds })
  const { data: histogram = [], isLoading: histogramLoading } = useToolCallHistogram({
    projectId: project.id,
    range: histogramRange,
    bucketSeconds: histogramBucketSeconds,
  })

  const visibleTools = useMemo(() => {
    const tools = analytics?.tools ?? []
    const search = searchQuery.trim().toLowerCase()
    const filtered = tools.filter((tool) => {
      if (search && !tool.name.toLowerCase().includes(search)) return false
      if (statusTab === "unused") return getToolStatuses(tool).includes("unused")
      if (statusTab === "failing") return getToolStatuses(tool).includes("failing")
      return true
    })
    return sortTools(filtered, sorting)
  }, [analytics, searchQuery, statusTab, sorting])

  const callsSum = useMemo(
    () => visibleTools.reduce((sum, tool) => sum + (tool.metrics?.calls ?? 0), 0),
    [visibleTools],
  )

  useEffect(() => {
    setFocusedToolName(undefined)
  }, [searchQuery, statusTab, rawSorting, tw.timeFrom, tw.timeTo])

  const hasAnyTools = (analytics?.tools.length ?? 0) > 0
  // `hasAnyTools` is over the All-time default, so no tools here means the project has never had a
  // tool call — a robust empty-state signal (not the best-effort `firstTraceAt`).
  const showEmptyState = !isLoading && !hasAnyTools && !searchQuery && statusTab === "all"
  const hasOnlyDefinedTools = !isLoading && hasAnyTools && (analytics?.totals.tracesWithToolCalls ?? 0) === 0

  return (
    <Layout>
      {showEmptyState ? null : (
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <TimeFilterDropdown
                {...(tw.pickerStartFrom ? { startTimeFrom: tw.pickerStartFrom } : {})}
                {...(tw.pickerStartTo ? { startTimeTo: tw.pickerStartTo } : {})}
                onChange={tw.onTimeChange}
              />
              <Tabs
                variant="bordered"
                size="sm"
                options={[
                  { id: "all", label: "All", icon: <LayoutGridIcon className="w-4 h-4" /> },
                  {
                    id: "unused",
                    label: "Unused",
                    icon: <CircleSlashIcon className="w-4 h-4" />,
                    tooltip: "Tools offered to the model in this window but never called.",
                  },
                  {
                    id: "failing",
                    label: "Failing",
                    icon: <TriangleAlertIcon className="w-4 h-4" />,
                    tooltip: "Tools with an error rate of 5% or more in this window.",
                  },
                ]}
                active={statusTab}
                onSelect={(value) => setStatusTab(value)}
              />
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <div className="relative">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search tools"
                  size="sm"
                  className="w-64 pl-8 rounded-lg"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <AddTargetMonitorButton
                projectId={project.id}
                projectSlug={project.slug}
                target={allToolsMonitorTarget()}
                label="Monitor tools"
              />
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
      )}
      {showEmptyState ? (
        <ToolsEmptyState isLoading={isLoading} />
      ) : (
        <div ref={scrollAreaRef} className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto">
          {hasOnlyDefinedTools ? (
            <div className="px-6 pb-2">
              <ToolsDiscoveryBanner projectId={project.id} />
            </div>
          ) : null}
          <div className="px-6">
            <ToolsAnalyticsPanel
              analytics={analytics}
              histogram={histogram}
              bucketSeconds={histogramBucketSeconds}
              rangeFromIso={histogramRange.fromIso}
              rangeToIso={histogramRange.toIso}
              isAllTime={tw.isAllTime}
              isLoading={isLoading || histogramLoading}
            />
          </div>
          <ToolsView
            tools={visibleTools}
            isLoading={isLoading}
            sorting={sorting}
            callsSum={callsSum}
            visibleColumnIds={columnSettings.visibleColumnIds}
            onSortChange={setSorting}
            projectSlug={project.slug}
            rangeFromIso={range.fromIso}
            rangeToIso={range.toIso}
            trendBucketSeconds={trendBucketSeconds}
            focusedToolName={focusedToolName}
            onFocusedToolChange={setFocusedToolName}
            scrollContainerRef={scrollAreaRef}
          />
        </div>
      )}
    </Layout>
  )
}
