import { Input, Tabs, useValueWithDefault } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { CircleSlashIcon, LayoutGridIcon, SearchIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useMemo } from "react"
import { useProjectTools, useToolCallHistogram } from "../../../../../domains/tools/tools.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useDebounce } from "../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import {
  DEFAULT_TOOLS_RANGE_SECONDS,
  getToolStatuses,
  pickToolTrendBucketSeconds,
} from "./-components/tool-formatters.ts"
import { ToolsAnalyticsPanel } from "./-components/tools-analytics-panel.tsx"
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
  "errorRate",
  "duration",
  "lastCalled",
] as const satisfies readonly ToolsTableSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly ToolsTableSorting["direction"][]
const SORT_PARAM_PATTERN = /^(calls|tracesPct|selectionRate|errorRate|duration|lastCalled):(asc|desc)$/

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
  const [timeFrom, setTimeFrom] = useParamState("toolsTimeFrom", "")
  const [timeTo, setTimeTo] = useParamState("toolsTimeTo", "")
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

  // Recomputed only when the URL params change, so query keys stay stable
  // across re-renders.
  const range = useMemo(() => {
    const toMs = timeTo ? Date.parse(timeTo) : Date.now()
    const fromMs = timeFrom ? Date.parse(timeFrom) : toMs - DEFAULT_TOOLS_RANGE_SECONDS * 1000
    return {
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString(),
    }
  }, [timeFrom, timeTo])
  const trendBucketSeconds = useMemo(
    () => pickToolTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )

  const { data: analytics, isLoading } = useProjectTools({ projectId: project.id, range, trendBucketSeconds })
  const { data: histogram = [], isLoading: histogramLoading } = useToolCallHistogram({
    projectId: project.id,
    range,
    bucketSeconds: trendBucketSeconds,
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

  const hasAnyTools = (analytics?.tools.length ?? 0) > 0
  const showEmptyState = !isLoading && !hasAnyTools && !searchQuery && statusTab === "all"

  return (
    <Layout>
      <Layout.Header
        title="Tools"
        description="Every tool your agents define and call, with usage, failure and latency metrics."
      />
      <Layout.Actions>
        <Layout.ActionsRow>
          <Layout.ActionRowItem>
            <TimeFilterDropdown
              startTimeFrom={timeFrom || range.fromIso}
              startTimeTo={timeTo || undefined}
              onChange={(from, to) => {
                setTimeFrom(from ?? "")
                setTimeTo(to ?? "")
              }}
            />
            <Tabs
              variant="bordered"
              size="sm"
              options={[
                { id: "all", label: "All", icon: <LayoutGridIcon className="w-4 h-4" /> },
                { id: "unused", label: "Unused", icon: <CircleSlashIcon className="w-4 h-4" /> },
                { id: "failing", label: "Failing", icon: <TriangleAlertIcon className="w-4 h-4" /> },
              ]}
              active={statusTab}
              onSelect={(value) => setStatusTab(value)}
            />
          </Layout.ActionRowItem>
          <Layout.ActionRowItem>
            <ColumnsSelector
              columns={TOOLS_COLUMN_OPTIONS}
              selectedColumnIds={columnSettings.visibleColumnIds}
              onChange={(nextColumnIds) => columnSettings.setVisibleColumnIds(nextColumnIds as ToolsColumnId[])}
              onOrderChange={(nextColumnIds) => columnSettings.setColumnIds(nextColumnIds as ToolsColumnId[])}
            />
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
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
      </Layout.Actions>
      {showEmptyState ? (
        <ToolsEmptyState isLoading={isLoading} />
      ) : (
        <>
          <div className="px-6">
            <ToolsAnalyticsPanel
              analytics={analytics}
              histogram={histogram}
              bucketSeconds={trendBucketSeconds}
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
          />
        </>
      )}
    </Layout>
  )
}
