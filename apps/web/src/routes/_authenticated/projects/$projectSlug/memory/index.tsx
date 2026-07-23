import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import {
  useMemoryActivityHistogram,
  useMemoryOverview,
  useMemoryStoresWithMetrics,
} from "../../../../../domains/memories/memories.collection.ts"
import { defaultProjectTimeWindowSeconds } from "../../../../../domains/projects/default-time-window.ts"
import { useAnalyticsTimeWindow } from "../../../../../domains/projects/use-analytics-time-window.ts"
import { useProjectFirstTraceAt, useProjectLastTraceAt } from "../../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { MemoryAnalyticsPanel } from "./-components/memory-analytics-panel.tsx"
import { MemoryEmptyState } from "./-components/memory-empty-state.tsx"
import { pickMemoryTrendBucketSeconds } from "./-components/memory-formatters.ts"
import {
  DEFAULT_MEMORY_SORTING,
  MEMORY_COLUMN_OPTIONS,
  type MemoryColumnId,
  type MemoryStoresSorting,
  MemoryStoresView,
} from "./-components/memory-stores-view.tsx"

const SORT_COLUMNS = [
  "records",
  "tokens",
  "sessions",
  "users",
  "writes",
  "reads",
  "ratio",
  "dead",
  "zeroHit",
  "churn",
  "lastActivity",
] as const satisfies readonly MemoryStoresSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly MemoryStoresSorting["direction"][]
const SORT_PARAM_PATTERN =
  /^(records|tokens|sessions|users|writes|reads|ratio|dead|zeroHit|churn|lastActivity):(asc|desc)$/

function serializeSorting(sorting: MemoryStoresSorting): string {
  return `${sorting.column}:${sorting.direction}`
}

function parseSorting(raw: string): MemoryStoresSorting {
  const [rawColumn, rawDirection] = raw.split(":")
  // Return allowlist constants, not the raw URL values, so the param's taint ends here.
  const column = SORT_COLUMNS.find((candidate) => candidate === rawColumn)
  const direction = SORT_DIRECTIONS.find((candidate) => candidate === rawDirection)
  if (column && direction) return { column, direction }
  return DEFAULT_MEMORY_SORTING
}

function MemoryBreadcrumb() {
  return <BreadcrumbText variant="current">Memory</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/memory/")({
  staticData: {
    breadcrumb: MemoryBreadcrumb,
  },
  component: MemoryPage,
})

function MemoryPage() {
  const project = useRouteProject()
  const { projectSlug } = Route.useParams()
  const { firstTraceAt } = useProjectFirstTraceAt({ projectId: project.id })
  const { lastTraceAt } = useProjectLastTraceAt({ projectId: project.id })
  const tw = useAnalyticsTimeWindow({
    project,
    fromKey: "memoryTimeFrom",
    toKey: "memoryTimeTo",
    allTimeLowerBoundIso: firstTraceAt,
    lastActivityIso: lastTraceAt,
  })

  const [rawSorting, setRawSorting] = useParamState("memorySort", serializeSorting(DEFAULT_MEMORY_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback((next: MemoryStoresSorting) => setRawSorting(serializeSorting(next)), [setRawSorting])

  const columnSettings = useTableColumnSettings<MemoryColumnId>({
    storageKey: "projects.memory.columns.v1",
    columns: MEMORY_COLUMN_OPTIONS,
  })

  // "All time" resolves the lower bound to the project's earliest activity so
  // the list covers every store without an unbounded scan param.
  const range = useMemo(
    () => ({ fromIso: tw.listRange.fromIso ?? tw.trendRange.fromIso, toIso: tw.listRange.toIso }),
    [tw.listRange, tw.trendRange],
  )
  const trendBucketSeconds = useMemo(
    () => pickMemoryTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )
  // The chart's right edge is "today" under All time (else the selected end),
  // with the All-time span clamped to the project window so it never scans the
  // full history per bucket. Unlike the shared trend range (anchored to the
  // last activity), this keeps every day up to today on the axis, trailing
  // empty ones included.
  const histogramRange = useMemo(() => {
    if (!tw.isAllTime) return range
    const endMs = Date.parse(range.toIso)
    const spanMs = defaultProjectTimeWindowSeconds(project) * 1000
    const lowerBoundMs = Date.parse(range.fromIso)
    const startMs = Math.max(endMs - spanMs, Number.isFinite(lowerBoundMs) ? lowerBoundMs : endMs - spanMs)
    return { fromIso: new Date(startMs).toISOString(), toIso: range.toIso }
  }, [tw.isAllTime, range, project])
  const histogramBucketSeconds = useMemo(
    () => pickMemoryTrendBucketSeconds(Date.parse(histogramRange.toIso) - Date.parse(histogramRange.fromIso)),
    [histogramRange],
  )

  const { stores, isLoading, infiniteScroll } = useMemoryStoresWithMetrics({
    projectId: project.id,
    range,
    sort: sorting.column,
    direction: sorting.direction,
    trendBucketSeconds,
  })
  const { data: overview, isLoading: overviewLoading } = useMemoryOverview({ projectId: project.id, range })
  const { data: histogram = [], isLoading: histogramLoading } = useMemoryActivityHistogram({
    projectId: project.id,
    range: histogramRange,
    bucketSeconds: histogramBucketSeconds,
  })

  // Empty over All time means the project has never had memory activity — a
  // real empty state (a picked window that's empty just shows the table's blank slate).
  const showEmptyState = !isLoading && stores.length === 0 && tw.isAllTime

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
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <ColumnsSelector
                columns={columnSettings.columns}
                selectedColumnIds={columnSettings.visibleColumnIds}
                onChange={(ids) => columnSettings.setVisibleColumnIds(ids as MemoryColumnId[])}
                onOrderChange={(ids) => columnSettings.setColumnIds(ids as MemoryColumnId[])}
              />
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
      )}
      {showEmptyState ? (
        <MemoryEmptyState />
      ) : (
        <>
          <div className="px-6">
            <MemoryAnalyticsPanel
              overview={overview}
              histogram={histogram}
              bucketSeconds={histogramBucketSeconds}
              rangeFromIso={histogramRange.fromIso}
              rangeToIso={histogramRange.toIso}
              isAllTime={tw.isAllTime}
              isLoading={overviewLoading || histogramLoading}
            />
          </div>
          <MemoryStoresView
            stores={stores}
            isLoading={isLoading}
            sorting={sorting}
            visibleColumnIds={columnSettings.visibleColumnIds}
            onSortChange={setSorting}
            infiniteScroll={infiniteScroll}
            projectSlug={projectSlug}
            rangeFromIso={range.fromIso}
            rangeToIso={range.toIso}
            trendBucketSeconds={trendBucketSeconds}
          />
        </>
      )}
    </Layout>
  )
}
