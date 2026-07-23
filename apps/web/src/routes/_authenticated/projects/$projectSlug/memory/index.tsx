import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import {
  useMemoryActivityHistogram,
  useMemoryAnalyticsOverview,
  useMemoryStoresWithMetrics,
  useMemoryZeroHitQueries,
} from "../../../../../domains/memories/memories.collection.ts"
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
  MEMORY_STORE_COLUMN_OPTIONS,
  type MemoryStoreColumnId,
  type MemoryStoresSorting,
  MemoryStoresView,
} from "./-components/memory-stores-view.tsx"
import { UnansweredSearchesCard } from "./-components/unanswered-searches-card.tsx"

const SORT_COLUMNS = [
  "lastUpdated",
  "lastRead",
  "records",
  "tokens",
  "sessions",
  "users",
  "reads",
  "yield",
  "netGrowth",
] as const satisfies readonly MemoryStoresSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly MemoryStoresSorting["direction"][]
const SORT_PARAM_PATTERN = /^(lastUpdated|lastRead|records|tokens|sessions|users|reads|yield|netGrowth):(asc|desc)$/

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
  const columnSettings = useTableColumnSettings<MemoryStoreColumnId>({
    storageKey: "projects.memory.columns.v1",
    columns: MEMORY_STORE_COLUMN_OPTIONS,
  })

  // Event-scoped reads need a concrete lower bound; "All time" resolves to the
  // project's earliest activity (falling back to the trend window's start).
  const range = useMemo(
    () => ({ fromIso: tw.listRange.fromIso ?? tw.trendRange.fromIso, toIso: tw.listRange.toIso }),
    [tw.listRange, tw.trendRange],
  )
  const trendBucketSeconds = useMemo(
    () => pickMemoryTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )
  // Chart clamps to the anchored window under All time so it never scans full history per bucket.
  const histogramRange = useMemo(() => (tw.isAllTime ? tw.trendRange : range), [tw.isAllTime, tw.trendRange, range])
  const histogramBucketSeconds = useMemo(
    () => pickMemoryTrendBucketSeconds(Date.parse(histogramRange.toIso) - Date.parse(histogramRange.fromIso)),
    [histogramRange],
  )

  const overview = useMemoryAnalyticsOverview({ projectId: project.id, range })
  const histogram = useMemoryActivityHistogram({
    projectId: project.id,
    range: histogramRange,
    bucketSeconds: histogramBucketSeconds,
  })
  const zeroHit = useMemoryZeroHitQueries({ projectId: project.id, range })
  const { stores, isLoading, infiniteScroll } = useMemoryStoresWithMetrics({
    projectId: project.id,
    range,
    sort: sorting.column,
    direction: sorting.direction,
    trendBucketSeconds,
  })

  const showEmptyState = !isLoading && stores.length === 0 && (overview.data?.liveRecords ?? 0) === 0

  return (
    <Layout>
      {showEmptyState ? (
        <MemoryEmptyState />
      ) : (
        <>
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
                  columns={MEMORY_STORE_COLUMN_OPTIONS}
                  selectedColumnIds={columnSettings.visibleColumnIds}
                  onChange={(ids) => columnSettings.setVisibleColumnIds(ids as MemoryStoreColumnId[])}
                  onOrderChange={(ids) => columnSettings.setColumnIds(ids as MemoryStoreColumnId[])}
                />
              </Layout.ActionRowItem>
            </Layout.ActionsRow>
          </Layout.Actions>
          <div className="flex flex-col gap-4 px-6">
            <MemoryAnalyticsPanel
              overview={overview.data}
              histogram={histogram.data ?? []}
              bucketSeconds={histogramBucketSeconds}
              rangeFromIso={histogramRange.fromIso}
              rangeToIso={histogramRange.toIso}
              isAllTime={tw.isAllTime}
              isLoading={overview.isLoading || histogram.isLoading}
            />
            <UnansweredSearchesCard queries={zeroHit.data ?? []} />
          </div>
          <MemoryStoresView
            stores={stores}
            isLoading={isLoading}
            sorting={sorting}
            onSortChange={setSorting}
            infiniteScroll={infiniteScroll}
            projectSlug={projectSlug}
            visibleColumnIds={columnSettings.visibleColumnIds}
            rangeFromIso={range.fromIso}
            rangeToIso={range.toIso}
            trendBucketSeconds={trendBucketSeconds}
          />
        </>
      )}
    </Layout>
  )
}
